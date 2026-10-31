package ca.antany.app.team.user;

import java.security.Principal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Resolves the signed-in manager. The session principal name is {@link #PREFIX} followed by the user id. */
@Component
public class CurrentUser {
    public static final String PREFIX = "u:";

    private final UserRepository users;

    CurrentUser(UserRepository users) {
        this.users = users;
    }

    public AppUser get(Principal principal) {
        // A live session whose user no longer exists (e.g. database wiped) must sign in again.
        return find(principal.getName()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in again"));
    }

    private java.util.Optional<AppUser> find(String name) {
        if (!name.startsWith(PREFIX)) return java.util.Optional.empty();
        try {
            return users.findById(UUID.fromString(name.substring(PREFIX.length())));
        } catch (IllegalArgumentException e) {
            return java.util.Optional.empty();
        }
    }
}
