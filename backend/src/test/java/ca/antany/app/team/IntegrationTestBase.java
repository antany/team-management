package ca.antany.app.team;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;

/** One Postgres container shared by all integration tests (Spring caches the context across classes). */
@SpringBootTest
@AutoConfigureMockMvc
abstract class IntegrationTestBase {
    @ServiceConnection
    static final PostgreSQLContainer DB = new PostgreSQLContainer("postgres:17");

    static {
        DB.start();
        Runtime.getRuntime().addShutdownHook(new Thread(DB::stop));
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JsonMapper json;

    static String uniq() { return UUID.randomUUID().toString().substring(0, 8); }

    /** Every call comes from a fresh client address, so the per-IP sign-up throttle does not trip across tests. */
    private static RequestPostProcessor freshIp() {
        return r -> {
            var b = UUID.randomUUID().toString().getBytes();
            r.setRemoteAddr("10." + (b[0] & 0xff) + "." + (b[1] & 0xff) + "." + (b[2] & 0xff));
            return r;
        };
    }

    protected ResultActions call(String path, Object body) throws Exception {
        return mvc.perform(post(path).with(freshIp()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    protected ResultActions call(String path, MockHttpSession s, Object body) throws Exception {
        return mvc.perform(post(path).session(s).with(freshIp()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    protected static MockHttpSession sessionOf(ResultActions r) {
        return (MockHttpSession) r.andReturn().getRequest().getSession(false);
    }

    /** Registers a throwaway manager and returns their signed-in session. */
    protected MockHttpSession signUp(String prefix) throws Exception {
        return sessionOf(call("/api/auth/register", Map.of("username", prefix + uniq(), "password", "correct horse")));
    }
}
