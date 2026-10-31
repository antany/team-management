package ca.antany.app.team.sync;

import ca.antany.app.team.sync.Entities.Col;
import ca.antany.app.team.sync.Entities.Entity;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Two-way sync of one manager's rows. Writes are last-write-wins per row by the client's updatedAt (clamped
 * to now + 5 minutes); deletes are tombstones. Rows that cannot be accepted come back in {@code rejected}
 * with the server's copy (if any) so the client converges, rather than failing the whole request.
 */
@Service
public class SyncService {
    static final int MAX_ROWS = 5000;

    public record Rejected(String table, String id, String reason) {}
    public record RestoreResult(int restored, int removed, int skipped) {}
    record Request(Long cursor, Map<String, List<Map<String, Object>>> changes) {}
    record Response(long cursor, Map<String, List<Map<String, Object>>> changes, List<Rejected> rejected) {}

    private final SyncRepository repo;

    public SyncService(SyncRepository repo) {
        this.repo = repo;
    }

    @Transactional
    Response sync(UUID userId, Request req) {
        repo.lock();
        long cursor = req.cursor() == null ? 0 : Math.max(0, req.cursor());
        Map<String, List<Map<String, Object>>> incoming = req.changes() == null ? Map.of() : req.changes();
        List<Rejected> rejected = new ArrayList<>();
        Map<String, List<String>> pushed = new LinkedHashMap<>();
        OffsetDateTime limit = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5);

        for (Entity e : Entities.ALL) {
            List<Map<String, Object>> rows = incoming.getOrDefault(e.key(), List.of());
            if (rows.size() > MAX_ROWS) rows = rows.subList(0, MAX_ROWS);
            List<String> ids = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                String reason = write(e, userId, row, limit);
                Object id = row.get("id");
                if (id != null) ids.add(id.toString());
                if (reason != null) rejected.add(new Rejected(e.key(), String.valueOf(id), reason));
            }
            pushed.put(e.key(), ids);
        }

        Map<String, List<Map<String, Object>>> out = new LinkedHashMap<>();
        for (Entity e : Entities.ALL) out.put(e.key(), repo.pull(e, userId, cursor, pushed.get(e.key())));
        return new Response(repo.currentSeq(), out, rejected);
    }

    /** Returns null when written (or quietly outranked by a newer server row), else the rejection reason. */
    private String write(Entity e, UUID userId, Map<String, Object> row, OffsetDateTime limit) {
        try {
            UUID id = UUID.fromString(String.valueOf(row.get("id")));
            OffsetDateTime updatedAt = Instant.parse(String.valueOf(row.get("updatedAt"))).truncatedTo(ChronoUnit.MILLIS).atOffset(ZoneOffset.UTC);
            if (updatedAt.isAfter(limit)) updatedAt = limit.truncatedTo(ChronoUnit.MILLIS);
            boolean deleted = Boolean.TRUE.equals(row.get("deleted"));

            UUID owner = repo.ownerOf(e, id).orElse(null);
            if (owner != null && !owner.equals(userId)) return "forbidden";

            UUID memberId = null;
            if (e.hasMember()) {
                memberId = UUID.fromString(String.valueOf(row.get("memberId")));
                if (!repo.memberExists(userId, memberId)) return "missing_parent";
            }
            Map<String, Object> values = new LinkedHashMap<>();
            for (Col c : e.cols()) values.put(c.column(), convert(c, row.get(c.json())));
            validate(e, values);
            repo.upsert(e, userId, id, memberId, values, updatedAt, deleted);
            return null;
        } catch (RuntimeException ex) {
            return "invalid";
        }
    }

    private static Object convert(Col c, Object v) {
        if (v == null) {
            if (c.required() && c.type() != Entities.Type.TEXT) throw new IllegalArgumentException(c.json());
            return c.type() == Entities.Type.TEXT ? "" : null;
        }
        return switch (c.type()) {
            case TEXT -> {
                String s = v.toString().strip();
                if (s.length() > c.max() || (c.required() && s.isEmpty())) throw new IllegalArgumentException(c.json());
                yield s;
            }
            case DATE -> LocalDate.parse(v.toString());
            case INT -> {
                if (!(v instanceof Number n)) throw new IllegalArgumentException(c.json());
                yield n.intValue();
            }
            case BOOL -> {
                if (!(v instanceof Boolean b)) throw new IllegalArgumentException(c.json());
                yield b;
            }
        };
    }

    private static void validate(Entity e, Map<String, Object> v) {
        if (v.containsKey("end_date") && v.get("end_date") != null && ((LocalDate) v.get("end_date")).isBefore((LocalDate) v.get("start_date"))) {
            throw new IllegalArgumentException("end before start");
        }
        if (e.key().equals("leaves") && !Entities.LEAVE_TYPES.contains(v.get("type"))) throw new IllegalArgumentException("type");
        if (e.key().equals("leaves") && "OTHER".equals(v.get("type")) && String.valueOf(v.get("note")).isBlank()) throw new IllegalArgumentException("reason");
        if (e.key().equals("members") && !Entities.MEMBER_CATEGORIES.contains(v.get("category"))) throw new IllegalArgumentException("category");
        if (e.key().equals("notes") && !Entities.NOTE_CATEGORIES.contains(v.get("category"))) throw new IllegalArgumentException("category");
        if (e.key().equals("allocations")) {
            int p = (Integer) v.get("percent");
            if (p < 0 || p > 200) throw new IllegalArgumentException("percent");
        }
    }

    /** All of a manager's live rows, keyed like a sync response. Used by backups. */
    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> exportAll(UUID userId) {
        Map<String, List<Map<String, Object>>> out = new LinkedHashMap<>();
        for (Entity e : Entities.ALL) {
            out.put(e.key(), repo.pull(e, userId, 0, List.of()).stream().filter(r -> !Boolean.TRUE.equals(r.get("deleted"))).toList());
        }
        return out;
    }

    /**
     * Brings the data back from a backup. Every row in the backup is written with the current time, so it wins
     * over whatever is there now (including deletions) and devices pick it up on their next sync. With
     * {@code replace}, rows that are not in the backup are deleted; otherwise they are left alone ("add missing").
     * Rows that cannot be accepted are counted as skipped.
     */
    @Transactional
    public RestoreResult restore(UUID userId, Map<?, ?> backup, boolean replace) {
        repo.lock();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
        int restored = 0, skipped = 0, removed = 0;
        Map<String, java.util.Set<UUID>> kept = new LinkedHashMap<>();
        for (Entity e : Entities.ALL) {
            Object raw = backup.get(e.key());
            List<?> rows = raw instanceof List<?> l ? l : List.of();
            java.util.Set<UUID> ids = new java.util.HashSet<>();
            for (Object o : rows) {
                if (!(o instanceof Map<?, ?> m)) { skipped++; continue; }
                Map<String, Object> row = new LinkedHashMap<>();
                m.forEach((k, v) -> row.put(String.valueOf(k), v));
                row.put("updatedAt", now.toInstant().toString());
                row.put("deleted", false);
                if (write(e, userId, row, now.plusMinutes(1)) == null) {
                    restored++;
                    ids.add(UUID.fromString(String.valueOf(row.get("id"))));
                } else {
                    skipped++;
                }
            }
            kept.put(e.key(), ids);
        }
        if (replace) {
            // children first is not required (tombstones only), but members last keeps parents alive while children go
            for (Entity e : Entities.ALL) removed += repo.tombstoneExcept(e, userId, kept.get(e.key()), now);
        }
        return new RestoreResult(restored, removed, skipped);
    }
}
