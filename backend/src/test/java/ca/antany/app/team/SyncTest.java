package ca.antany.app.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

class SyncTest extends IntegrationTestBase {
    private static final Instant BASE = Instant.now().minusSeconds(3600).truncatedTo(ChronoUnit.MILLIS);

    static String at(long seconds) { return BASE.plusSeconds(seconds).toString(); }

    static Map<String, Object> member(UUID id, String name, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("name", name); m.put("title", "Engineer"); m.put("startDate", "2024-01-15");
        m.put("about", ""); m.put("archived", false); m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> leave(UUID id, UUID memberId, String start, String end, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("memberId", memberId); m.put("startDate", start); m.put("endDate", end);
        m.put("type", "VACATION"); m.put("note", ""); m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> note(UUID id, UUID memberId, String body, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("memberId", memberId); m.put("category", "FEEDBACK"); m.put("body", body);
        m.put("noteDate", "2026-10-01"); m.put("followUpDate", "2026-11-01"); m.put("done", false);
        m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> allocation(UUID id, UUID memberId, int percent, long t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("memberId", memberId); m.put("project", "Apollo"); m.put("percent", percent);
        m.put("startDate", "2026-01-01"); m.put("endDate", null); m.put("note", ""); m.put("deleted", false); m.put("updatedAt", at(t));
        return m;
    }

    static Map<String, Object> changes(List<?> members, List<?> leaves, List<?> allocations, List<?> notes) {
        return Map.of("members", members, "leaves", leaves, "allocations", allocations, "notes", notes);
    }

    String sync(MockHttpSession s, long cursor, Map<String, Object> changes) throws Exception {
        return call("/api/sync", s, Map.of("cursor", cursor, "changes", changes))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void pushedRowsComeBackToAnotherDevice() throws Exception {
        MockHttpSession a = signUp("a");
        UUID m = UUID.randomUUID(), l = UUID.randomUUID(), n = UUID.randomUUID(), al = UUID.randomUUID();
        String r1 = sync(a, 0, changes(List.of(member(m, "Sam", 0)), List.of(leave(l, m, "2026-12-24", "2026-12-31", 1)),
            List.of(allocation(al, m, 80, 1)), List.of(note(n, m, "Great demo", 1))));
        assertEquals(List.of(), JsonPath.read(r1, "$.rejected"));

        String pulled = sync(a, 0, changes(List.of(), List.of(), List.of(), List.of()));
        assertEquals("Sam", JsonPath.read(pulled, "$.changes.members[0].name"));
        assertEquals("2026-12-24", JsonPath.read(pulled, "$.changes.leaves[0].startDate"));
        assertEquals(80, (int) JsonPath.read(pulled, "$.changes.allocations[0].percent"));
        assertEquals("Great demo", JsonPath.read(pulled, "$.changes.notes[0].body"));
        long cursor = ((Number) JsonPath.read(pulled, "$.cursor")).longValue();
        String none = sync(a, cursor, changes(List.of(), List.of(), List.of(), List.of()));
        assertEquals(0, ((List<?>) JsonPath.read(none, "$.changes.members")).size());
    }

    @Test
    void lastWriteWinsAndDeletesAreTombstones() throws Exception {
        MockHttpSession a = signUp("lww");
        UUID m = UUID.randomUUID();
        sync(a, 0, changes(List.of(member(m, "New name", 10)), List.of(), List.of(), List.of()));
        String stale = sync(a, 0, changes(List.of(member(m, "Old name", 5)), List.of(), List.of(), List.of()));
        assertEquals("New name", JsonPath.read(stale, "$.changes.members[0].name"));
        Map<String, Object> gone = member(m, "New name", 20);
        gone.put("deleted", true);
        sync(a, 0, changes(List.of(gone), List.of(), List.of(), List.of()));
        String after = sync(a, 0, changes(List.of(member(m, "Resurrect", 15)), List.of(), List.of(), List.of()));
        assertEquals(true, JsonPath.read(after, "$.changes.members[0].deleted"));
    }

    @Test
    void managersNeverSeeEachOthersRows() throws Exception {
        MockHttpSession a = signUp("own"), b = signUp("other");
        UUID m = UUID.randomUUID();
        sync(a, 0, changes(List.of(member(m, "Private", 0)), List.of(), List.of(), List.of()));
        String bPull = sync(b, 0, changes(List.of(), List.of(), List.of(), List.of()));
        assertEquals(0, ((List<?>) JsonPath.read(bPull, "$.changes.members")).size());
        // b cannot overwrite a's row by reusing its id
        String attempt = sync(b, 0, changes(List.of(member(m, "Hijack", 100)), List.of(), List.of(), List.of()));
        assertEquals("forbidden", JsonPath.read(attempt, "$.rejected[0].reason"));
        String aPull = sync(a, 0, changes(List.of(), List.of(), List.of(), List.of()));
        assertEquals("Private", JsonPath.read(aPull, "$.changes.members[0].name"));
        // and cannot attach rows to a's member
        String child = sync(b, 0, changes(List.of(), List.of(leave(UUID.randomUUID(), m, "2026-01-01", "2026-01-02", 1)), List.of(), List.of()));
        assertEquals("missing_parent", JsonPath.read(child, "$.rejected[0].reason"));
    }

    @Test
    void invalidRowsAreRejectedWithoutFailingTheRequest() throws Exception {
        MockHttpSession a = signUp("bad");
        UUID m = UUID.randomUUID();
        Map<String, Object> badLeave = leave(UUID.randomUUID(), m, "2026-02-10", "2026-02-01", 1);
        Map<String, Object> badType = leave(UUID.randomUUID(), m, "2026-02-01", "2026-02-02", 1);
        badType.put("type", "NOPE");
        String r = sync(a, 0, changes(List.of(member(m, "Ok", 0), member(UUID.randomUUID(), "  ", 0)), List.of(badLeave, badType),
            List.of(allocation(UUID.randomUUID(), m, 500, 1)), List.of()));
        assertEquals(4, ((List<?>) JsonPath.read(r, "$.rejected")).size());
        assertEquals(1, ((List<?>) JsonPath.read(r, "$.changes.members")).size());
    }

    @Test
    void anonymousCannotSync() throws Exception {
        call("/api/sync", Map.of("cursor", 0)).andExpect(status().isUnauthorized());
    }

    @Test
    void customHolidaysSyncLikeEverythingElse() throws Exception {
        MockHttpSession a = signUp("hol"), b = signUp("hob");
        UUID id = UUID.randomUUID();
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("id", id); h.put("holidayDate", "2026-12-24"); h.put("name", "Company day"); h.put("deleted", false); h.put("updatedAt", at(0));
        String r = sync(a, 0, Map.<String, Object>of("holidays", List.of(h)));
        assertEquals(List.of(), JsonPath.read(r, "$.rejected"));
        assertEquals("Company day", JsonPath.read(sync(a, 0, Map.<String, Object>of()), "$.changes.holidays[0].name"));
        assertEquals(0, ((List<?>) JsonPath.read(sync(b, 0, Map.<String, Object>of()), "$.changes.holidays")).size());
        Map<String, Object> bad = new LinkedHashMap<>(h);
        bad.put("id", UUID.randomUUID()); bad.put("name", " ");
        assertEquals("invalid", JsonPath.read(sync(a, 0, Map.<String, Object>of("holidays", List.of(bad))), "$.rejected[0].reason"));
        assertEquals("forbidden", JsonPath.read(sync(b, 0, Map.<String, Object>of("holidays", List.of(h))), "$.rejected[0].reason"));
    }

    @Test
    void leaveTypesPersonalIsAcceptedAndOtherNeedsAReason() throws Exception {
        MockHttpSession a = signUp("lt");
        UUID m = UUID.randomUUID();
        Map<String, Object> personal = leave(UUID.randomUUID(), m, "2026-03-02", "2026-03-02", 1);
        personal.put("type", "PERSONAL");
        Map<String, Object> otherNoReason = leave(UUID.randomUUID(), m, "2026-03-03", "2026-03-03", 1);
        otherNoReason.put("type", "OTHER");
        Map<String, Object> otherWithReason = leave(UUID.randomUUID(), m, "2026-03-04", "2026-03-04", 1);
        otherWithReason.put("type", "OTHER"); otherWithReason.put("note", "Jury duty");
        Map<String, Object> legacy = leave(UUID.randomUUID(), m, "2026-03-05", "2026-03-05", 1);
        legacy.put("type", "HOLIDAY");
        String r = sync(a, 0, changes(List.of(member(m, "Lee", 0)), List.of(personal, otherNoReason, otherWithReason, legacy), List.of(), List.of()));
        assertEquals(1, ((List<?>) JsonPath.read(r, "$.rejected")).size());
        assertEquals(otherNoReason.get("id").toString(), JsonPath.read(r, "$.rejected[0].id"));
        assertEquals(3, ((List<?>) JsonPath.read(r, "$.changes.leaves")).size());
    }
}
