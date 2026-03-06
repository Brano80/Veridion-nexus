// Quick utility to generate a bcrypt hash for "password"
// Run with: cargo run --bin generate_password_hash

use bcrypt;

fn main() {
    let password = "password";
    match bcrypt::hash(password, bcrypt::DEFAULT_COST) {
        Ok(hash) => {
            println!("Password: {}", password);
            println!("Hash: {}", hash);
            println!("\nSQL to update admin user:");
            println!("UPDATE users SET password_hash = '{}' WHERE username = 'admin' AND email = 'admin@localhost';", hash);
        }
        Err(e) => {
            eprintln!("Error generating hash: {}", e);
        }
    }
}
