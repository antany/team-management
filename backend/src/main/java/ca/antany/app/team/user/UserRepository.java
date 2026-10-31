package ca.antany.app.team.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private final JdbcClient jdbc;

    UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    private static final String COLUMNS = "select id, username, display_name from app_user ";

    public Optional<AppUser> findById(UUID id) {
        return jdbc.sql(COLUMNS + "where id = :id").param("id", id).query(AppUser.class).optional();
    }

    /** An account together with its stored hash. */
    public record Credentials(AppUser user, String passwordHash) {}

    public Optional<Credentials> findCredentials(String username) {
        return jdbc.sql("select id, username, display_name, password_hash from app_user where lower(username) = lower(:u)")
            .param("u", username)
            .query((rs, n) -> new Credentials(new AppUser(rs.getObject("id", UUID.class), rs.getString("username"),
                    rs.getString("display_name")), rs.getString("password_hash")))
            .optional();
    }

    public Optional<String> passwordHash(UUID id) {
        return jdbc.sql("select password_hash from app_user where id = :id").param("id", id).query(String.class).optional();
    }

    /** Throws DuplicateKeyException if the username is taken. */
    public AppUser insertWithPassword(String username, String passwordHash) {
        UUID id = UUID.randomUUID();
        jdbc.sql("insert into app_user (id, username, password_hash, display_name) values (:id, :u, :h, :u)")
            .param("id", id).param("u", username).param("h", passwordHash).update();
        return new AppUser(id, username, username);
    }

    public void updatePasswordHash(UUID id, String passwordHash) {
        jdbc.sql("update app_user set password_hash = :h where id = :id").param("id", id).param("h", passwordHash).update();
    }
}
