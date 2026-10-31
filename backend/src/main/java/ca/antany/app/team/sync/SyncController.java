package ca.antany.app.team.sync;

import ca.antany.app.team.user.CurrentUser;
import java.security.Principal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
class SyncController {
    private final SyncService service;
    private final CurrentUser currentUser;

    SyncController(SyncService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping
    SyncService.Response sync(@RequestBody(required = false) SyncService.Request body, Principal principal) {
        return service.sync(currentUser.get(principal).id(), body == null ? new SyncService.Request(0L, null) : body);
    }
}
