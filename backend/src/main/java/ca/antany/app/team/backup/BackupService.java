package ca.antany.app.team.backup;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Storage for the app's encrypted daily backups: one file per manager per day under
 * {@code app.backup.dir/<user id>/team-backup-YYYY-MM-DD.json}, newest {@code app.backup.keep-days} days kept.
 * The server never sees the contents: the app encrypts the backup with the manager's PIN before uploading, and
 * the PIN never leaves the device. The server only checks that what it stores looks like an encrypted envelope.
 */
@Service
public class BackupService {
    static final Pattern NAME = Pattern.compile("team-backup-(\\d{4}-\\d{2}-\\d{2})\\.json");
    public static final String APP = "team-management";

    public record BackupFile(String name, long size, String date) {}

    private final Path root;
    private final int keepDays;

    BackupService(@Value("${app.backup.dir:./backups}") String dir, @Value("${app.backup.keep-days:14}") int keepDays) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
        this.keepDays = keepDays;
    }

    private Path dirOf(UUID userId) {
        return root.resolve(userId.toString());
    }

    /** Stores (replacing) the backup for a day. {@code date} is the client's local date. */
    public BackupFile store(UUID userId, LocalDate date, byte[] body) {
        String name = "team-backup-" + date + ".json";
        Path dir = dirOf(userId);
        try {
            Files.createDirectories(dir);
            Path tmp = Files.createTempFile(dir, ".backup", ".part");
            Files.write(tmp, body);
            Files.move(tmp, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            prune(dir);
            return new BackupFile(name, body.length, date.toString());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void prune(Path dir) throws IOException {
        List<BackupFile> files = list(dir);
        if (files.size() <= keepDays) return;
        for (BackupFile f : files.subList(keepDays, files.size())) Files.deleteIfExists(dir.resolve(f.name()));
    }

    private static List<BackupFile> list(Path dir) throws IOException {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> s = Files.list(dir)) {
            List<BackupFile> out = new ArrayList<>();
            for (Path p : s.toList()) {
                var m = NAME.matcher(p.getFileName().toString());
                if (m.matches()) out.add(new BackupFile(p.getFileName().toString(), Files.size(p), m.group(1)));
            }
            out.sort((a, b) -> b.name().compareTo(a.name()));
            return out;
        }
    }

    public List<BackupFile> files(UUID userId) {
        try {
            return list(dirOf(userId));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The backup file's path, or null if the name is not a backup name or the file does not exist. */
    public Path file(UUID userId, String name) {
        if (!NAME.matcher(name).matches()) return null;
        Path p = dirOf(userId).resolve(name).normalize();
        return p.startsWith(dirOf(userId)) && Files.isRegularFile(p) ? p : null;
    }

    static String text(byte[] body) {
        return new String(body, StandardCharsets.UTF_8);
    }
}
