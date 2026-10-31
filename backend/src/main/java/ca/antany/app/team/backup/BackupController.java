package ca.antany.app.team.backup;

import ca.antany.app.team.sync.SyncService;
import ca.antany.app.team.user.CurrentUser;
import java.nio.file.Path;
import java.security.Principal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Encrypted backups. The app encrypts (with a key derived from the PIN) and uploads; restoring downloads the
 * ciphertext, decrypts it in the app and posts the plain rows to {@code /restore}.
 */
@RestController
@RequestMapping("/api/backup")
class BackupController {
    private static final int MAX_BYTES = 20 * 1024 * 1024;

    private final BackupService backups;
    private final SyncService sync;
    private final CurrentUser currentUser;
    private final JsonMapper json;

    BackupController(BackupService backups, SyncService sync, CurrentUser currentUser, JsonMapper json) {
        this.backups = backups;
        this.sync = sync;
        this.currentUser = currentUser;
        this.json = json;
    }

    @GetMapping("/files")
    List<BackupService.BackupFile> files(Principal principal) {
        return backups.files(currentUser.get(principal).id());
    }

    /** Stores the encrypted backup for {@code date} (the device's local date), replacing that day's file. */
    @PutMapping("/files/{date}")
    BackupService.BackupFile put(@PathVariable String date, @RequestBody byte[] body, Principal principal) {
        LocalDate day;
        try {
            day = LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad date");
        }
        if (day.isAfter(LocalDate.now().plusDays(2))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad date");
        if (body.length > MAX_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Backup is too large");
        requireEncryptedEnvelope(body);
        return backups.store(currentUser.get(principal).id(), day, body);
    }

    /** Never store plaintext: the upload must be an encrypted envelope, not the rows themselves. */
    private void requireEncryptedEnvelope(byte[] body) {
        try {
            JsonNode n = json.readTree(body);
            boolean ok = BackupService.APP.equals(n.path("app").asString(null)) && n.path("version").asInt() == 1
                && n.path("enc").asBoolean(false) && n.hasNonNull("salt") && n.hasNonNull("iv") && n.hasNonNull("ct")
                && !n.has("members");
            if (!ok) throw new IllegalArgumentException();
        } catch (RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Backups must be encrypted by the app before they are uploaded");
        }
    }

    @GetMapping("/files/{name}")
    ResponseEntity<FileSystemResource> download(@PathVariable String name, Principal principal) {
        Path p = backups.file(currentUser.get(principal).id(), name);
        if (p == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such backup");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"").body(new FileSystemResource(p));
    }

    /**
     * Brings the data back from a backup the app has already decrypted. {@code replace} makes the data match the
     * backup (rows not in it are deleted); {@code merge} only adds or brings back what the backup contains.
     */
    @PostMapping("/restore")
    SyncService.RestoreResult restore(@RequestBody Map<String, Object> backup, @RequestParam(defaultValue = "replace") String mode, Principal principal) {
        if (!BackupService.APP.equals(backup.get("app")) || !Integer.valueOf(1).equals(backup.get("version"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This is not a Team Manager backup");
        }
        if (!mode.equals("replace") && !mode.equals("merge")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown mode");
        return sync.restore(currentUser.get(principal).id(), backup, mode.equals("replace"));
    }
}
