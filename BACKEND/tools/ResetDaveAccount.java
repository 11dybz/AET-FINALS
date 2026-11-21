package com.pitchr.backend;
import java.sql.Connection;
/** Backward-compatible entry point for the existing Dave reset command and checks. */
public final class ResetDaveAccount {
    static final String EMAIL = "davefontelar2005@gmail.com";
    static final String PROFILE = "fontelar-dave";
    public static void main(String[] args) {
        String[] forwarded = new String[args.length + 1];
        forwarded[0] = "dave";
        System.arraycopy(args, 0, forwarded, 1, args.length);
        ResetProfileAccount.main(forwarded);
    }
    static ResetProfileAccount.Result reset(Connection connection, boolean createIfMissing) throws Exception {
        return ResetProfileAccount.reset(connection, createIfMissing, ResetProfileAccount.target("dave"));
    }
}
