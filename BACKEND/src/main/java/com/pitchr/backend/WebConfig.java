package com.pitchr.backend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
import java.util.Arrays;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String[] origins;

    public WebConfig(@Value("${pitchr.allowed-origins}") String origins) {
        this.origins = Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }

    /** Allow admin-key and profile-delete requests from the configured separate frontend origins. */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(origins)
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("Content-Type", "X-Admin-Key", "X-Team-Key").allowCredentials(true).maxAge(3600);
    }

    /** Disable caching for mutable API responses but permit immutable caching for uploaded images. */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new org.springframework.web.servlet.HandlerInterceptor() {
            @Override
            public boolean preHandle(jakarta.servlet.http.HttpServletRequest request,
                                     jakarta.servlet.http.HttpServletResponse response, Object handler) {
                response.setHeader("Cache-Control", "no-store");
                return true;
            }
        }).addPathPatterns("/api/**").excludePathPatterns("/api/images/**");
    }
}
