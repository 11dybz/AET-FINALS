package com.pitchr.backend;
import java.sql.Connection;

/** Offline checks for Justin's explicitly requested reset and profile assignment. */
public final class ResetJustinAccountTest {
    static final ResetProfileAccount.Target JUSTIN = ResetProfileAccount.target("justin");
    static void verify(Connection c) throws Exception {
        ResetDaveAccountTest.check(PasswordHasher.matches("12345678",ResetDaveAccountTest.value(c,"select password_hash from accounts where email='villanuevajustin270@gmail.com'")),"Justin password not accepted");
        ResetDaveAccountTest.check("villanueva-justin".equals(ResetDaveAccountTest.value(c,"select profile_id from accounts where email='villanuevajustin270@gmail.com'")),"Justin main profile edit access missing");
    }
    public static void main(String[] args) throws Exception {
        try(var c=ResetDaveAccountTest.database(4)) {
            ResetDaveAccountTest.account(c,"justin",JUSTIN.email(),JUSTIN.profileId());
            ResetDaveAccountTest.account(c,"dave",ResetDaveAccount.EMAIL,ResetDaveAccount.PROFILE);
            ResetDaveAccountTest.check(!ResetProfileAccount.reset(c,false,JUSTIN).created(),"Existing Justin account recreated");
            verify(c);
            ResetDaveAccountTest.check("previous-hash".equals(ResetDaveAccountTest.value(c,"select password_hash from accounts where id='dave'")),"Dave password changed");
            ResetDaveAccountTest.check("fontelar-dave".equals(ResetDaveAccountTest.value(c,"select profile_id from accounts where id='dave'")),"Dave profile ownership changed");
            ResetDaveAccountTest.check("1".equals(ResetDaveAccountTest.value(c,"select count(*) from account_sessions where account_id='dave'")),"Dave session changed");
            ResetDaveAccountTest.check("0".equals(ResetDaveAccountTest.value(c,"select count(*) from account_sessions where account_id='justin'")),"Justin old session retained");
            ResetProfileAccount.reset(c,false,JUSTIN);verify(c);
            System.out.println("PASS: Justin reset and repeated use preserve Dave's account, ownership and session");
        }
        try(var c=ResetDaveAccountTest.database(5)) {
            ResetDaveAccountTest.account(c,"justin",JUSTIN.email(),null);
            ResetProfileAccount.reset(c,false,JUSTIN);verify(c);
            System.out.println("PASS: existing unlinked Justin account receives main profile edit access");
        }
        try(var c=ResetDaveAccountTest.database(6)) {
            ResetDaveAccountTest.check(ResetProfileAccount.reset(c,true,JUSTIN).created(),"Missing Justin account not created");
            verify(c);
            ResetDaveAccountTest.check("Justin Villanueva".equals(ResetDaveAccountTest.value(c,"select display_name from accounts where email='villanuevajustin270@gmail.com'")),"Wrong account display name");
            System.out.println("PASS: explicit creation uses Justin's email, name, main profile and requested password");
        }
        try(var c=ResetDaveAccountTest.database(7)) {
            ResetDaveAccountTest.account(c,"owner","unrelated@example.com",JUSTIN.profileId());
            try {ResetProfileAccount.reset(c,true,JUSTIN);throw new AssertionError("Unrelated owner overwritten");}
            catch(IllegalStateException expected) {ResetDaveAccountTest.check(expected.getMessage().contains("unrelated"),"Wrong conflict diagnostic");}
            ResetDaveAccountTest.check("0".equals(ResetDaveAccountTest.value(c,"select count(*) from accounts where email='villanuevajustin270@gmail.com'")),"Failed operation created account");
            System.out.println("PASS: unrelated owner remains intact and failed operation makes no account changes");
        }
    }
}
