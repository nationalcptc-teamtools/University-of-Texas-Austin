alias ls='ls --color=auto'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'
alias diff='diff --color=auto'
alias ip='ip -color=auto'

alias ll='ls -lFh'
alias la='ll -A'

alias g='git'
alias nv='nvim'

function passgen {
	if [[ -z "$1" ]]; then
		amt=16
	else
		amt=$1
	fi
	let "amt2 = int(amt / 1.13)"
	base91 <(dd if=/dev/random bs=$amt2 count=1 2>/dev/null) /dev/fd/1 | head -c $amt && echo
}
alias sudoeditdiff="VISUAL='nvim -d' sudoedit"

alias rnv="nvr --servername \$(nvr --serverlist | head -n1) --remote"

alias nw="alacritty --working-directory . &!"
