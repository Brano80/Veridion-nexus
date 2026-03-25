use bcrypt;

fn main() {
    let password = "Admin1234!";
    
    match bcrypt::hash(password, bcrypt::DEFAULT_COST) {
        Ok(hash) => {
            println!("Password: {}", password);
            println!("Bcrypt hash: {}", hash);
            println!("Hash length: {}", hash.len());
            println!("Hash prefix: {}", &hash[..7]);
        }
        Err(e) => {
            eprintln!("Error generating hash: {}", e);
            std::process::exit(1);
        }
    }
}
