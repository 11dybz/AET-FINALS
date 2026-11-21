package com.pitchr.backend;

import java.io.StringReader;
import java.nio.file.*;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;

/** Trusted local maintenance command for the specific account requested by the owner. */
public final class ResetProfileAccount {
    record Target(String email, String profileId, String name, Set<String> previousOwners) {}
    static Target target(String member) {
        return switch (member) {
            case "dave" -> new Target("davefontelar2005@gmail.com", "fontelar-dave", "Dave Fontelar", Set.of("fontelardave85@gmail.com"));
            case "justin" -> new Target("villanuevajustin270@gmail.com", "villanueva-justin", "Justin Villanueva", Set.of());
            default -> throw new IllegalArgumentException("Choose one of the explicitly authorized members: dave or justin.");
        };
    }
    record Result(boolean created) {}

    public static void main(String[] args) {
        try {
            if (args.length < 2 || !Set.of("supabase", "local").contains(args[1]))
                throw new IllegalArgumentException("Choose the same database as your backend: supabase or local.");
            Target target = target(args[0]);
            boolean create = Arrays.asList(args).contains("--create-if-missing");
            try (Connection connection = connect(args[1])) {
                Result result = reset(connection, create, target);
                System.out.println("SUCCESS: " + (result.created() ? "Created " : "Reset ") + target.email());
                System.out.println("Main profile: " + target.name() + " (" + target.profileId() + "). Edit access verified.");
                System.out.println("Password: 12345678. Previous login sessions were signed out.");
                System.out.println("Database: " + args[1] + ". Log in again using this backend; no restart is needed.");
            }
        } catch (Exception error) {
            String message = error instanceof SQLException
                ? "Database connection or transaction failed (SQL state " + ((SQLException)error).getSQLState() + "). Check the selected database and connection settings."
                : error.getMessage();
            System.err.println("NOT COMPLETED: " + message);
            System.exit(1);
        }
    }

    private static Connection connect(String database) throws Exception {
        Properties options = new Properties();
        if (database.equals("local")) {
            options.setProperty("user", System.getenv().getOrDefault("DB_USERNAME", "sa"));
            options.setProperty("password", System.getenv().getOrDefault("DB_PASSWORD", ""));
            return DriverManager.getConnection("jdbc:h2:file:" + Path.of("data/pitchr").toAbsolutePath() + ";IFEXISTS=TRUE", options);
        }
        Properties config = new Properties();
        if (Files.exists(Path.of(".env")))
            config.load(new StringReader(Files.readString(Path.of(".env")).replaceFirst("^\\uFEFF", "")));
        String url = setting(config, "SUPABASE_DB_URL");
        options.setProperty("user", setting(config, "SUPABASE_DB_USERNAME"));
        options.setProperty("password", setting(config, "SUPABASE_DB_PASSWORD"));
        options.setProperty("sslmode", "require");
        options.setProperty("currentSchema", "pitchr");
        options.setProperty("connectTimeout", "10");
        options.setProperty("socketTimeout", "30");
        return DriverManager.getConnection(url, options);
    }
    private static String setting(Properties config, String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) value = config.getProperty(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + name + " in the backend environment or .env file.");
        return value;
    }

    static Result reset(Connection connection, boolean createIfMissing, Target target) throws Exception {
        boolean originalAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            try (var query = connection.prepareStatement("select id from profiles where id=? for update")) {
                query.setString(1, target.profileId());
                try (var rows = query.executeQuery()) {
                    if (!rows.next()) throw new IllegalStateException(target.name() + "'s main profile is missing. Start the backend with this database before running the reset.");
                }
            }
            try (var query = connection.prepareStatement("select email from accounts where profile_id=? for update")) {
                query.setString(1, target.profileId());
                try (var rows = query.executeQuery()) {
                    if (rows.next() && !(target.email().equalsIgnoreCase(rows.getString(1)) || target.previousOwners().contains(rows.getString(1).toLowerCase(Locale.ROOT))))
                        throw new IllegalStateException(target.name() + "'s main profile belongs to an unrelated account. No changes were applied.");
                }
            }
            String accountId = null;
            try (var query = connection.prepareStatement("select id from accounts where lower(email)=? for update")) {
                query.setString(1, target.email());
                try (var rows = query.executeQuery()) { if (rows.next()) accountId = rows.getString(1); }
            }
            boolean created = accountId == null;
            if (created && !createIfMissing)
                throw new IllegalStateException("The account is not registered. Run again with -CreateIfMissing to create this account.");
            String hash = PasswordHasher.hash("12345678");
            if (created) {
                accountId = UUID.randomUUID().toString();
                String workspace = UUID.randomUUID().toString();
                try (var insert = connection.prepareStatement("insert into visitor_sessions(id,expires_at) values (?,?)")) {
                    insert.setString(1, workspace); insert.setObject(2, OffsetDateTime.now().plusDays(30)); insert.executeUpdate();
                }
                try (var insert = connection.prepareStatement("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at) values (?,?,?,?,?,?)")) {
                    insert.setString(1, accountId); insert.setString(2, target.name()); insert.setString(3, target.email());
                    insert.setString(4, hash); insert.setString(5, workspace); insert.setObject(6, OffsetDateTime.now()); insert.executeUpdate();
                }
            }
            for (String previousOwner : target.previousOwners()) {
                try (var release = connection.prepareStatement("update accounts set profile_id=null where lower(email)=? and profile_id=?")) {
                    release.setString(1, previousOwner); release.setString(2, target.profileId()); release.executeUpdate();
                }
            }
            try (var update = connection.prepareStatement("update accounts set password_hash=?,profile_id=? where id=?")) {
                update.setString(1, hash); update.setString(2, target.profileId()); update.setString(3, accountId);
                if (update.executeUpdate() != 1) throw new IllegalStateException("Account changed during reset. No changes were applied; please retry.");
            }
            try (var delete = connection.prepareStatement("delete from account_sessions where account_id=?")) {
                delete.setString(1, accountId); delete.executeUpdate();
            }
            try (var verify = connection.prepareStatement("select password_hash,profile_id from accounts where id=?")) {
                verify.setString(1, accountId);
                try (var rows = verify.executeQuery()) {
                    if (!rows.next() || !target.profileId().equals(rows.getString(2)) || !PasswordHasher.matches("12345678", rows.getString(1)))
                        throw new IllegalStateException("Reset verification failed. No changes were applied.");
                }
            }
            connection.commit();
            return new Result(created);
        } catch (Exception error) {
            connection.rollback(); throw error;
        } finally { connection.setAutoCommit(originalAutoCommit); }
    }
}
