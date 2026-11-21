package com.pitchr.backend;
import java.nio.file.*;
import java.sql.*;
import java.util.Comparator;
import org.h2.tools.RunScript;

/** Offline verification; does not read .env or connect to the shared database. */
public final class ResetDaveAccountTest {
    static Connection database(int scenario) throws Exception {
        Connection c=DriverManager.getConnection("jdbc:h2:mem:dave-reset-command-"+scenario,"sa","");
        try(var files=Files.list(Path.of("src/main/resources/db/migration"))) {
            for(var file:files.filter(p->p.getFileName().toString().matches("V(?:[1-9]|1[0-4])__.*\\.sql"))
                .sorted(Comparator.comparingInt(p->Integer.parseInt(p.getFileName().toString().split("__")[0].substring(1)))).toList())
                try(var reader=Files.newBufferedReader(file)){RunScript.execute(c,reader);}
        }
        return c;
    }
    static void account(Connection c,String id,String email,String profile) throws Exception {
        try(var s=c.prepareStatement("insert into visitor_sessions(id,expires_at) values (?,DATEADD('DAY',30,CURRENT_TIMESTAMP))")) {s.setString(1,id);s.executeUpdate();}
        try(var s=c.prepareStatement("insert into accounts(id,display_name,email,password_hash,workspace_id,created_at,profile_id) values (?,'Member',?,'previous-hash',?,CURRENT_TIMESTAMP,?)")) {
            s.setString(1,id);s.setString(2,email);s.setString(3,id);s.setString(4,profile);s.executeUpdate();
        }
        try(var s=c.prepareStatement("insert into account_sessions(id,account_id,created_at,expires_at) values (?,?,CURRENT_TIMESTAMP,DATEADD('DAY',7,CURRENT_TIMESTAMP))")) {
            s.setString(1,id+"-session");s.setString(2,id);s.executeUpdate();
        }
    }
    static String value(Connection c,String sql) throws Exception {try(var r=c.createStatement().executeQuery(sql)){r.next();return r.getString(1);}}
    static void check(boolean condition,String message) {if(!condition)throw new AssertionError(message);}
    static void verifyDave(Connection c) throws Exception {
        check(PasswordHasher.matches("12345678",value(c,"select password_hash from accounts where email='davefontelar2005@gmail.com'")),"Requested password not accepted");
        check("fontelar-dave".equals(value(c,"select profile_id from accounts where email='davefontelar2005@gmail.com'")),"Main profile edit access missing");
    }
    public static void main(String[] args) throws Exception {
        try(var c=database(1)) {
            account(c,"old","fontelardave85@gmail.com","fontelar-dave");account(c,"dave",ResetDaveAccount.EMAIL,null);account(c,"other","other@example.com",null);
            check(!ResetDaveAccount.reset(c,false).created(),"Existing account was recreated");verifyDave(c);
            check(value(c,"select profile_id from accounts where id='old'")==null,"Old Dave account still owns main profile");
            check("previous-hash".equals(value(c,"select password_hash from accounts where id='other'")),"Other password changed");
            check("0".equals(value(c,"select count(*) from account_sessions where account_id='dave'")),"Dave session remains active");
            check("1".equals(value(c,"select count(*) from account_sessions where account_id='other'")),"Other session removed");
            ResetDaveAccount.reset(c,false);verifyDave(c);
            System.out.println("PASS: existing account reset, ownership transfer, isolated session revocation and repeated use");
        }
        try(var c=database(2)) {
            try {ResetDaveAccount.reset(c,false);throw new AssertionError("Missing account silently accepted");}
            catch(IllegalStateException expected) {check(expected.getMessage().contains("not registered"),"Wrong missing-account diagnostic");}
            check(ResetDaveAccount.reset(c,true).created(),"Missing account was not created");verifyDave(c);
            check("1".equals(value(c,"select count(*) from accounts")),"Unexpected extra account");
            System.out.println("PASS: missing-account diagnostic and explicit account creation");
        }
        try(var c=database(3)) {
            account(c,"owner","unrelated@example.com","fontelar-dave");account(c,"dave",ResetDaveAccount.EMAIL,null);
            try {ResetDaveAccount.reset(c,true);throw new AssertionError("Unrelated owner overwritten");}
            catch(IllegalStateException expected) {check(expected.getMessage().contains("unrelated"),"Wrong ownership diagnostic");}
            check("previous-hash".equals(value(c,"select password_hash from accounts where id='dave'")),"Failed transaction changed password");
            check("fontelar-dave".equals(value(c,"select profile_id from accounts where id='owner'")),"Failed transaction changed owner");
            check("1".equals(value(c,"select count(*) from account_sessions where account_id='dave'")),"Failed transaction removed session");
            System.out.println("PASS: unrelated owner protected and failed transaction leaves account unchanged");
        }
    }
}
