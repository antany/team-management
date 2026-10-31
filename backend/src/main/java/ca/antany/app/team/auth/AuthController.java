package ca.antany.app.team.auth;

import ca.antany.app.team.user.AppUser;
import ca.antany.app.team.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
    public record MeResponse(UUID id, String username, String displayName) {}
    public record Options(boolean passwordSignup) {}
    public record LoginRequest(String username, String password) {}
    public record PasswordChange(String currentPassword, String newPassword) {}

    private final CurrentUser currentUser;
    private final PasswordAccounts accounts;
    private final HttpSessionSecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    AuthController(CurrentUser currentUser, PasswordAccounts accounts) {
        this.currentUser = currentUser;
        this.accounts = accounts;
    }

    @GetMapping("/me")
    public MeResponse me(Principal principal) {
        return toMe(currentUser.get(principal));
    }

    /** Whether the login page offers "Create account". Public. */
    @GetMapping("/auth/options")
    public Options options() {
        return new Options(accounts.signupOpen());
    }

    @PostMapping("/auth/register")
    public ResponseEntity<MeResponse> register(@RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
        AppUser user = accounts.register(body.username(), body.password(), req.getRemoteAddr());
        signIn(user, req, res);
        return ResponseEntity.status(HttpStatus.CREATED).body(toMe(user));
    }

    @PostMapping("/auth/login")
    public MeResponse login(@RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
        AppUser user = accounts.login(body.username(), body.password(), req.getRemoteAddr());
        signIn(user, req, res);
        return toMe(user);
    }

    @PostMapping("/auth/password")
    public ResponseEntity<Void> changePassword(@RequestBody PasswordChange body, Principal principal) {
        accounts.changePassword(currentUser.get(principal), body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent().build();
    }

    private void signIn(AppUser user, HttpServletRequest req, HttpServletResponse res) {
        if (req.getSession(false) != null) req.changeSessionId(); // no session fixation
        var auth = UsernamePasswordAuthenticationToken.authenticated(CurrentUser.PREFIX + user.id(), null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        contexts.saveContext(ctx, req, res);
    }

    private static MeResponse toMe(AppUser u) {
        return new MeResponse(u.id(), u.username(), u.displayName());
    }
}
