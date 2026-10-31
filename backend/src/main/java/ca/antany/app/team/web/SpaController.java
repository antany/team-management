package ca.antany.app.team.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Client-side routes of the React app. Forwarding them to index.html makes refresh, bookmarks and
 * the installed PWA's start URL work. Listed explicitly so unknown /api/** paths still 404.
 */
@Controller
class SpaController {
    @GetMapping({"/login", "/home", "/people", "/people/*", "/calendar", "/work", "/notes", "/review", "/review/*", "/settings"})
    String index() {
        return "forward:/index.html";
    }
}
