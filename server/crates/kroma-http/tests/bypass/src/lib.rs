pub fn reach(address: &str) -> std::io::Result<std::net::TcpStream> {
    std::net::TcpStream::connect(address)
}
