package ca.antany.app.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = { "app.backup.dir=build/test-backups", "app.backup.keep-days=3" })
class BackupTest extends IntegrationTestBase {
    static final List<Object> NONE = List.of();
    static final String ENVELOPE = "{\"app\":\"team-management\",\"version\":1,\"enc\":true,\"salt\":\"c2FsdA==\",\"iv\":\"aXY=\",\"ct\":\"Y2lwaGVy\"}";

    org.springframework.test.web.servlet.ResultActions upload(MockHttpSession s, String date, String body) throws Exception {
        return mvc.perform(put("/api/backup/files/" + date).session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String pull(MockHttpSession s) throws Exception {
        return call("/api/sync", s, Map.of("cursor", 0, "changes", Map.of())).andReturn().getResponse().getContentAsString();
    }

    int live(String syncJson, String table) {
        return JsonPath.<List<Map<String, Object>>>read(syncJson, "$.changes." + table + "[?(@.deleted == false)]").size();
    }

    @Test
    void encryptedBackupsAreStoredListedAndReturnedByteForByte() throws Exception {
        MockHttpSession s = signUp("bk");
        String today = LocalDate.now().toString();
        upload(s, today, ENVELOPE).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("team-backup-" + today + ".json"));
        mvc.perform(get("/api/backup/files").session(s)).andExpect(status().isOk()).andExpect(jsonPath("$[0].date").value(today));
        mvc.perform(get("/api/backup/files/team-backup-" + today + ".json").session(s))
            .andExpect(status().isOk()).andExpect(content().string(ENVELOPE));
        upload(s, today, ENVELOPE.replace("Y2lwaGVy", "bmV3")).andExpect(status().isOk()); // same day replaces
        assertEquals(1, ((List<?>) JsonPath.read(mvc.perform(get("/api/backup/files").session(s)).andReturn().getResponse().getContentAsString(), "$")).size());
    }

    @Test
    void plaintextAndMalformedUploadsAreRefused() throws Exception {
        MockHttpSession s = signUp("pl");
        String today = LocalDate.now().toString();
        upload(s, today, "{\"app\":\"team-management\",\"version\":1,\"members\":[{\"name\":\"Sam\"}]}").andExpect(status().isBadRequest());
        upload(s, today, ENVELOPE.replace("\"enc\":true", "\"enc\":true,\"members\":[]")).andExpect(status().isBadRequest());
        upload(s, today, "not json").andExpect(status().isBadRequest());
        upload(s, "yesterday", ENVELOPE).andExpect(status().isBadRequest());
        upload(s, LocalDate.now().plusDays(30).toString(), ENVELOPE).andExpect(status().isBadRequest());
    }

    @Test
    void onlyTheNewestFewDaysAreKeptAndBackupsArePrivate() throws Exception {
        MockHttpSession a = signUp("ka"), b = signUp("kb");
        for (int i = 5; i >= 0; i--) upload(a, LocalDate.now().minusDays(i).toString(), ENVELOPE).andExpect(status().isOk());
        String files = mvc.perform(get("/api/backup/files").session(a)).andReturn().getResponse().getContentAsString();
        assertEquals(3, ((List<?>) JsonPath.read(files, "$")).size());
        assertEquals(LocalDate.now().toString(), JsonPath.read(files, "$[0].date"));
        String name = JsonPath.read(files, "$[0].name");
        mvc.perform(get("/api/backup/files/" + name).session(b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/backup/files/..%2F..%2Fapplication.yml").session(a)).andExpect(status().is4xxClientError());
        mvc.perform(get("/api/backup/files/nope.json").session(a)).andExpect(status().isNotFound());
        mvc.perform(get("/api/backup/files")).andExpect(status().isUnauthorized());
    }

    @Test
    void restoreReplaceMakesTheDataMatchTheBackup() throws Exception {
        MockHttpSession s = signUp("rs");
        UUID m = UUID.randomUUID(), l = UUID.randomUUID(), stray = UUID.randomUUID();
        Map<String, Object> sam = SyncTest.member(m, "Sam", 0);
        sam.put("email", "sam@example.com"); sam.put("phone", "416-555-0100"); sam.put("emergencyContact", "Pat 416-555-0101");
        call("/api/sync", s, Map.of("cursor", 0, "changes", SyncTest.changes(List.of(sam), List.of(SyncTest.leave(l, m, "2026-12-24", "2026-12-31", 1)), NONE, NONE)));
        String before = pull(s);
        Map<String, Object> backup = Map.of("app", "team-management", "version", 1,
            "members", JsonPath.read(before, "$.changes.members"), "leaves", JsonPath.read(before, "$.changes.leaves"),
            "allocations", List.of(), "notes", List.of());
        assertEquals("sam@example.com", JsonPath.read(before, "$.changes.members[0].email"));

        // something goes wrong: rename, delete the leave, add a stray member
        Map<String, Object> wrecked = SyncTest.member(m, "Wrecked", 50);
        Map<String, Object> gone = SyncTest.leave(l, m, "2026-12-24", "2026-12-31", 50);
        gone.put("deleted", true);
        call("/api/sync", s, Map.of("cursor", 0, "changes", SyncTest.changes(List.of(wrecked, SyncTest.member(stray, "Stray", 50)), List.of(gone), NONE, NONE)));

        mvc.perform(post("/api/backup/restore?mode=replace").session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(backup)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.restored").value(2)).andExpect(jsonPath("$.removed").value(1));
        String after = pull(s);
        assertEquals(1, live(after, "members"));
        assertEquals("Sam", JsonPath.<List<String>>read(after, "$.changes.members[?(@.deleted == false)].name").get(0));
        assertEquals("416-555-0100", JsonPath.<List<String>>read(after, "$.changes.members[?(@.deleted == false)].phone").get(0));
        assertEquals(1, live(after, "leaves"));
    }

    @Test
    void mergeKeepsOtherRowsAndForeignRowsAreSkipped() throws Exception {
        MockHttpSession owner = signUp("mo"), other = signUp("mx");
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        call("/api/sync", owner, Map.of("cursor", 0, "changes", SyncTest.changes(List.of(SyncTest.member(a, "Ann", 0)), NONE, NONE, NONE)));
        String ownerPull = pull(owner);
        Map<String, Object> backup = Map.of("app", "team-management", "version", 1, "members", JsonPath.read(ownerPull, "$.changes.members"));
        call("/api/sync", owner, Map.of("cursor", 0, "changes", SyncTest.changes(List.of(SyncTest.member(b, "Ben", 5)), NONE, NONE, NONE)));
        mvc.perform(post("/api/backup/restore?mode=merge").session(owner).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(backup)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.removed").value(0));
        assertEquals(2, live(pull(owner), "members"));

        // another manager cannot take Ann's row over by uploading a backup that contains it
        mvc.perform(post("/api/backup/restore").session(other).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(backup)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.restored").value(0)).andExpect(jsonPath("$.skipped").value(1));
        assertEquals(0, live(pull(other), "members"));
        assertEquals(2, live(pull(owner), "members"));

        mvc.perform(post("/api/backup/restore").session(owner).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"app\":\"other\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/backup/restore?mode=wipe").session(owner).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(backup))).andExpect(status().isBadRequest());
    }
}
