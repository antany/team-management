package ca.antany.app.team;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;

class AuthTest extends IntegrationTestBase {
    @Autowired JdbcClient jdbc;

    @Test
    void registeringCreatesAnAccountAndSignsIn() throws Exception {
        String u = "Ann_" + uniq();
        MockHttpSession s = sessionOf(call("/api/auth/register", Map.of("username", u, "password", "correct horse"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.username").value(u.toLowerCase())));
        mvc.perform(get("/api/me").session(s)).andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value(u.toLowerCase()));
    }

    @Test
    void onlyAUsernameAndABcryptHashAreStored() throws Exception {
        String u = "hash" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "s3cret-pass")).andExpect(status().isCreated());
        String hash = jdbc.sql("select password_hash from app_user where username = :u").param("u", u).query(String.class).single();
        assertTrue(hash.startsWith("{bcrypt}") && !hash.contains("s3cret-pass"), hash);
    }

    @Test
    void usernamesAreCaseInsensitiveAndUnique() throws Exception {
        String u = "dup" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "password-1")).andExpect(status().isCreated());
        call("/api/auth/register", Map.of("username", u.toUpperCase(), "password", "password-2")).andExpect(status().isConflict());
    }

    @Test
    void badUsernamesAndPasswordsAreRejected() throws Exception {
        call("/api/auth/register", Map.of("username", "ab", "password", "password-1")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "me@mail.com", "password", "password-1")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "ok" + uniq(), "password", "short")).andExpect(status().isBadRequest());
        call("/api/auth/register", Map.of("username", "ok" + uniq(), "password", "x".repeat(73))).andExpect(status().isBadRequest());
    }

    @Test
    void loginFailuresGiveOneGenericAnswer() throws Exception {
        String u = "login" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "right-password"));
        MockHttpSession s = sessionOf(call("/api/auth/login", Map.of("username", u.toUpperCase(), "password", "right-password")).andExpect(status().isOk()));
        mvc.perform(get("/api/me").session(s)).andExpect(status().isOk());
        call("/api/auth/login", Map.of("username", u, "password", "wrong-password"))
            .andExpect(status().isUnauthorized()).andExpect(status().reason("Wrong username or password"));
        call("/api/auth/login", Map.of("username", "nobody" + uniq(), "password", "wrong-password"))
            .andExpect(status().isUnauthorized()).andExpect(status().reason("Wrong username or password"));
    }

    @Test
    void repeatedWrongPasswordsLockTheAccountTemporarily() throws Exception {
        String u = "lock" + uniq();
        call("/api/auth/register", Map.of("username", u, "password", "right-password"));
        for (int i = 0; i < 5; i++) call("/api/auth/login", Map.of("username", u, "password", "nope-nope")).andExpect(status().isUnauthorized());
        call("/api/auth/login", Map.of("username", u, "password", "right-password")).andExpect(status().isTooManyRequests());
    }

    @Test
    void changingThePasswordNeedsTheCurrentOne() throws Exception {
        String u = "chg" + uniq();
        MockHttpSession s = sessionOf(call("/api/auth/register", Map.of("username", u, "password", "old-password")));
        call("/api/auth/password", s, Map.of("currentPassword", "wrong-one", "newPassword", "new-password")).andExpect(status().isBadRequest());
        call("/api/auth/password", s, Map.of("currentPassword", "old-password", "newPassword", "new-password")).andExpect(status().isNoContent());
        call("/api/auth/login", Map.of("username", u, "password", "old-password")).andExpect(status().isUnauthorized());
        call("/api/auth/login", Map.of("username", u, "password", "new-password")).andExpect(status().isOk());
    }

    @Test
    void loginNeedsACsrfTokenAndTheApiNeedsASession() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
        call("/api/sync", Map.of()).andExpect(status().isUnauthorized());
    }

    @Test
    void optionsArePublic() throws Exception {
        mvc.perform(get("/api/auth/options")).andExpect(status().isOk()).andExpect(jsonPath("$.passwordSignup").value(true));
    }

    @Test
    void aSessionForADeletedUserMustSignInAgain() throws Exception {
        String u = "gone" + uniq();
        MockHttpSession s = sessionOf(call("/api/auth/register", Map.of("username", u, "password", "right-password")));
        jdbc.sql("delete from app_user where username = :u").param("u", u).update();
        mvc.perform(get("/api/me").session(s)).andExpect(status().isUnauthorized());
    }
}
