package com.pitchr.backend;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me/conversations/{profileId}/locations")
class LocationController {
    private final PortfolioService service;
    LocationController(PortfolioService service) { this.service = service; }

    @GetMapping
    ResponseEntity<List<MessageResponse>> list(@CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @PathVariable String profileId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.locations(token, profileId));
    }
    @PostMapping
    MessageResponse share(@CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @PathVariable String profileId, @Valid @RequestBody Share request) {
        return service.shareLocation(token, profileId, request.latitude(), request.longitude(), request.name(), request.minutes());
    }
    @PostMapping("/{id}/stop")
    MessageResponse stop(@CookieValue(name = PortfolioController.COOKIE, required = false) String token,
        @PathVariable String profileId, @PathVariable long id) {
        return service.stopLocation(token, profileId, id);
    }
    record Share(@NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @NotBlank @Size(max = 100) String name, @NotNull Integer minutes) {}
}
