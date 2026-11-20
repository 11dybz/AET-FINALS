package com.pitchr.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class PitchrBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(PitchrBackendApplication.class, args);
	}

}
