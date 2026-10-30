pub(crate) unsafe fn enter(uid_map: &[u8], gid_map: &[u8]) -> std::io::Result<()> {
    if libc::unshare(libc::CLONE_NEWUSER | libc::CLONE_NEWNET) != 0 {
        return Err(std::io::Error::last_os_error());
    }
    write_proc(c"/proc/self/setgroups", b"deny")?;
    write_proc(c"/proc/self/uid_map", uid_map)?;
    write_proc(c"/proc/self/gid_map", gid_map)?;
    loopback_up()
}

unsafe fn write_proc(path: &std::ffi::CStr, contents: &[u8]) -> std::io::Result<()> {
    let fd = libc::open(path.as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC);
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }
    let written = libc::write(fd, contents.as_ptr().cast(), contents.len());
    libc::close(fd);
    if written != contents.len() as isize {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

// A new network namespace starts with `lo` down, and a module's own
// loopback forwarders (for libraries that cannot dial a Unix socket) need it.
unsafe fn loopback_up() -> std::io::Result<()> {
    let fd = libc::socket(libc::AF_INET, libc::SOCK_DGRAM | libc::SOCK_CLOEXEC, 0);
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }
    let mut request: libc::ifreq = std::mem::zeroed();
    for (slot, byte) in request.ifr_name.iter_mut().zip(b"lo\0") {
        *slot = *byte as libc::c_char;
    }
    let mut result = libc::ioctl(fd, libc::SIOCGIFFLAGS, &mut request);
    if result == 0 {
        request.ifr_ifru.ifru_flags |= (libc::IFF_UP | libc::IFF_RUNNING) as libc::c_short;
        result = libc::ioctl(fd, libc::SIOCSIFFLAGS, &request);
    }
    libc::close(fd);
    if result != 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}
