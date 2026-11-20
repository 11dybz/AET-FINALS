package com.pitchr.backend;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me")
class ConnectionController {
    private final ConnectionService connections;
    ConnectionController(ConnectionService connections) { this.connections=connections; }
    @GetMapping("/connections")
    List<ConnectionService.View> list(@CookieValue(name=PortfolioController.COOKIE,required=false) String token) { return connections.list(token); }
    @PostMapping("/connection-requests/{profileId}")
    ConnectionService.View request(@CookieValue(name=PortfolioController.COOKIE,required=false) String token,
        @PathVariable String profileId, @RequestBody(required=false) Request body) {
        return connections.request(token,profileId,body != null && body.priority());
    }
    @PostMapping("/connections/{profileId}/action")
    ConnectionService.View action(@CookieValue(name=PortfolioController.COOKIE,required=false) String token,
        @PathVariable String profileId,@Valid @RequestBody Action body) { return connections.action(token,profileId,body.action()); }
    record Request(boolean priority) {}
    record Action(@NotBlank @Pattern(regexp="accept|decline|cancel|remove") String action) {}
}
