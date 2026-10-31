package ca.antany.app.team;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = "app.password-signup=false")
class SignupDisabledTest extends IntegrationTestBase {
    @Test
    void registrationIsClosed() throws Exception {
        call("/api/auth/register", Map.of("username", "late" + uniq(), "password", "correct horse")).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/options")).andExpect(jsonPath("$.passwordSignup").value(false));
    }
}
