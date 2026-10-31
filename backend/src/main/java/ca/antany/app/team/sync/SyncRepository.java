package ca.antany.app.team.sync;

import ca.antany.app.team.sync.Entities.Col;
import ca.antany.app.team.sync.Entities.Entity;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL for the synced tables, generated from {@link Entities}. */
@Repository
class SyncRepository {
    private static final long LOCK_KEY = 7_420_001L;

    private final JdbcClient jdbc;

    SyncRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Serialises sync transactions so seq order equals commit order (a client's cursor never skips a row). */
    void lock() {
        jdbc.sql("select pg_advisory_xact_lock(:k)").param("k", LOCK_KEY).query().singleRow();
    }

    long currentSeq() {
        return jdbc.sql("select case when is_called then last_value else 0 end from change_seq").query(Long.class).single();
    }

    Optional<UUID> ownerOf(Entity e, UUID id) {
        return jdbc.sql("select user_id from " + e.table() + " where id = :id").param("id", id).query(UUID.class).optional();
    }

    boolean memberExists(UUID userId, UUID memberId) {
        return jdbc.sql("select count(*) from team_member where id = :id and user_id = :u")
            .param("id", memberId).param("u", userId).query(Long.class).single() > 0;
    }

    /** Last-write-wins: only replaces a row with a strictly older updated_at. */
    void upsert(Entity e, UUID userId, UUID id, UUID memberId, Map<String, Object> values, OffsetDateTime updatedAt, boolean deleted) {
        List<String> cols = new ArrayList<>(List.of("id", "user_id"));
        if (e.hasMember()) cols.add("member_id");
        e.cols().forEach(c -> cols.add(c.column()));
        cols.addAll(List.of("updated_at", "deleted", "seq"));
        List<String> insertValues = cols.stream().map(c -> c.equals("seq") ? "nextval('change_seq')" : ":" + c).toList();
        String updates = cols.stream().filter(c -> !c.equals("id") && !c.equals("user_id"))
            .map(c -> c + " = excluded." + c).collect(Collectors.joining(", "));
        String sql = "insert into " + e.table() + " (" + String.join(", ", cols) + ") values (" + String.join(", ", insertValues)
            + ") on conflict (id) do update set " + updates
            + " where " + e.table() + ".updated_at < excluded.updated_at and " + e.table() + ".user_id = excluded.user_id";
        var stmt = jdbc.sql(sql).param("id", id).param("user_id", userId).param("updated_at", updatedAt).param("deleted", deleted);
        if (e.hasMember()) stmt = stmt.param("member_id", memberId);
        for (Col c : e.cols()) stmt = stmt.param(c.column(), values.get(c.column()));
        stmt.update();
    }

    /** Rows changed after the cursor, plus the current copy of any row the client just pushed. */
    List<Map<String, Object>> pull(Entity e, UUID userId, long cursor, List<String> pushedIds) {
        String sql = "select * from " + e.table() + " where user_id = :u and (seq > :c or id::text = any(:ids)) order by seq";
        return jdbc.sql(sql).param("u", userId).param("c", cursor).param("ids", pushedIds.toArray(new String[0]))
            .query((rs, n) -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getObject("id", UUID.class).toString());
                if (e.hasMember()) m.put("memberId", rs.getObject("member_id", UUID.class).toString());
                for (Col c : e.cols()) {
                    m.put(c.json(), switch (c.type()) {
                        case TEXT -> rs.getString(c.column());
                        case DATE -> { LocalDate d = rs.getObject(c.column(), LocalDate.class); yield d == null ? null : d.toString(); }
                        case INT -> rs.getInt(c.column());
                        case BOOL -> rs.getBoolean(c.column());
                    });
                }
                m.put("updatedAt", rs.getObject("updated_at", OffsetDateTime.class).toInstant().toString());
                m.put("deleted", rs.getBoolean("deleted"));
                return m;
            }).list();
    }

    /** Marks every live row of the manager that is not in {@code keep} as deleted. Returns how many. */
    int tombstoneExcept(Entity e, UUID userId, java.util.Set<UUID> keep, OffsetDateTime at) {
        List<UUID> ids = jdbc.sql("select id from " + e.table() + " where user_id = :u and not deleted").param("u", userId).query(UUID.class).list()
            .stream().filter(id -> !keep.contains(id)).toList();
        for (UUID id : ids) {
            jdbc.sql("update " + e.table() + " set deleted = true, updated_at = :t, seq = nextval('change_seq') where id = :id")
                .param("t", at).param("id", id).update();
        }
        return ids.size();
    }
}
