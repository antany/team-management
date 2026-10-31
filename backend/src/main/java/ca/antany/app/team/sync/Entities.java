package ca.antany.app.team.sync;

import java.util.List;

/**
 * The synced tables, described once. The client sends and receives rows as JSON objects whose keys are the
 * {@code json} names below plus {@code id}, {@code updatedAt} and {@code deleted}. Order matters: parents
 * (members) come before the rows that point at them.
 */
final class Entities {
    private Entities() {}

    enum Type { TEXT, DATE, INT, BOOL }

    /** A column. {@code required} text must be non-blank, required dates/ints must be present. */
    record Col(String json, String column, Type type, boolean required, int max) {}

    record Entity(String key, String table, boolean hasMember, List<Col> cols) {}

    private static Col text(String name, boolean required, int max) { return new Col(name, snake(name), Type.TEXT, required, max); }
    private static Col date(String name, boolean required) { return new Col(name, snake(name), Type.DATE, required, 0); }
    private static Col integer(String name) { return new Col(name, snake(name), Type.INT, true, 0); }
    private static Col bool(String name) { return new Col(name, snake(name), Type.BOOL, true, 0); }

    static String snake(String camel) {
        return camel.replaceAll("([A-Z])", "_$1").toLowerCase();
    }

    static final List<String> LEAVE_TYPES = List.of("VACATION", "SICK", "PERSONAL", "OTHER", "HOLIDAY");
    static final List<String> MEMBER_CATEGORIES = List.of("", "DEV", "BSA", "QA", "ENGINEER");
    static final List<String> NOTE_CATEGORIES = List.of("ONE_ON_ONE", "FEEDBACK", "KUDOS", "CONCERN", "GOAL", "OTHER");

    static final List<Entity> ALL = List.of(
        new Entity("members", "team_member", false, List.of(
            text("name", true, 120), text("title", false, 120), date("startDate", false),
            text("about", false, 10_000), bool("archived"),
            text("email", false, 200), text("phone", false, 60), text("emergencyContact", false, 300),
            text("category", false, 20))),
        new Entity("leaves", "leave_entry", true, List.of(
            date("startDate", true), date("endDate", true), text("type", true, 20), text("note", false, 2_000))),
        new Entity("allocations", "allocation", true, List.of(
            text("project", true, 160), integer("percent"), date("startDate", true), date("endDate", false),
            text("note", false, 2_000))),
        new Entity("notes", "member_note", true, List.of(
            text("category", true, 20), text("body", true, 20_000), date("noteDate", true),
            date("followUpDate", false), bool("done"))),
        new Entity("holidays", "custom_holiday", false, List.of(date("holidayDate", true), text("name", true, 120))));
}
