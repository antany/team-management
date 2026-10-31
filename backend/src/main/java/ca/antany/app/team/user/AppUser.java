package ca.antany.app.team.user;

import java.util.UUID;

/** One manager. Only a username and a password hash are stored; no email or other personal details. */
public record AppUser(UUID id, String username, String displayName) {}
