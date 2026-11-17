#!/usr/bin/env python3
"""Run a command inside a pseudo-terminal of a fixed size.

usage: pty_bridge.py COLS ROWS CWD CMD [ARGS...]

stdin bytes go to the terminal, terminal output goes to stdout unchanged.
The child always runs with NEBI_VERIFY=1: it is a verification session nobody sits at, so nebi-beacon and the
Stop hook write no beacon and send no push (the caller also passes --settings to silence Claude Code itself).
Exits with the child's exit code. SIGTERM/SIGINT/SIGHUP are forwarded.
"""
import errno, fcntl, os, pty, select, signal, struct, sys, termios

cols, rows, cwd, cmd = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4:]

pid, fd = pty.fork()
if pid == 0:
    # Child: fd 0 is the pty slave. Set the size before exec so the app reads it at startup.
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    os.chdir(cwd)
    os.environ["NEBI_VERIFY"] = "1"
    os.execvp(cmd[0], cmd)

def forward(sig, _frame):
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        pass

for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(s, forward)

stdin_open = True
while True:
    watch = [fd] + ([0] if stdin_open else [])
    try:
        ready, _, _ = select.select(watch, [], [])
    except InterruptedError:
        continue
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError as e:
            if e.errno == errno.EIO:
                data = b""
            else:
                raise
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    if 0 in ready:
        data = os.read(0, 65536)
        if data:
            os.write(fd, data)
        else:
            stdin_open = False

_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else status >> 8)
