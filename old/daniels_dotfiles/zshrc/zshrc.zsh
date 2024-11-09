zmodload zsh/mathfunc
zmodload zsh/mapfile

setopt extendedglob
# set environment variables
export DOTNET_CLI_TELEMETRY_OPTOUT=true
#echo "env"
if [[ -z "$ENV_D_SUCCESSFUL" && -n ~/.config/environment.d/*.conf(#qN) ]]; then
	for f in $(ls -v ~/.config/environment.d/*.conf); do
		#echo "env $f"
		for line in ${(f)mapfile[$f]}; do
			#echo "exporting $line"
			eval export $line
		done
	done
fi

# set personal programs
export EDITOR=nvim
export DIFFPROG='nvim -d'

TTY="$(tty)"
if [[ "$TTY" = /dev/tty* ]]; then
	export TMOUT=600
fi

if [[ "$TTY" == "/dev/tty1" && -e /usr/bin/sway ]]; then
	unset TMOUT
	exec sway # start de on tty1
fi
#
# add personal paths
export PATH="$HOME/bin:$HOME/.config/bin:$HOME/.local/bin:$HOME/opt/bin:$PATH:$HOME/.gem/ruby/2.7.0/bin:$HOME/.gem/ruby/3.0.0/bin:$HOME/.cargo/bin:$HOME/Android/Sdk/platform-tools:/opt/dotnet"

[[ -e /etc/profile.d/pico-sdk.sh ]] && source /etc/profile.d/pico-sdk.sh


# zsh stuff
zmodload zsh/complist 
# The following lines were added by compinstall

zstyle ':completion:*' completer _expand _complete _ignored _approximate _prefix
zstyle ':completion:*' matcher-list '' 'm:{[:lower:][:upper:]}={[:upper:][:lower:]}'
zstyle ':completion:*' max-errors 0 numeric
zstyle :compinstall filename '/home/daniel/.zshrc'

autoload -Uz compinit
compinit
# End of lines added by compinstall
# Lines configured by zsh-newuser-install
HISTFILE=~/.config/zsh/zsh_history
HISTSIZE=50000
SAVEHIST=10000000
setopt beep extendedglob nomatch notify
unsetopt autocd
bindkey -v
# End of lines configured by zsh-newuser-install

APPEND_HISTORY=1
HIST_IGNORE_ALL_DUPS=1
HIST_IGNORE_SPACE=1
DISABLE_AUTO_TITLE=1

bindkey -M menuselect '^[' undo

function vi-reset() {
	zle kill-whole-line
	zle vi-insert
}
zle -N vi-reset
bindkey -M vicmd '^U' vi-reset
bindkey -M viins '^U' kill-whole-line
bindkey -M viins '^W' backward-delete-word
bindkey -M viins '^H' backward-delete-char
bindkey -M viins '^R' history-incremental-search-backward

bindkey -M menuselect 'h' vi-backward-char
bindkey -M menuselect 'k' vi-up-line-or-history
bindkey -M menuselect 'l' vi-forward-char
bindkey -M menuselect 'j' vi-down-line-or-history

bindkey -M menuselect '^[[Z' reverse-menu-complete

REPORTTIME=5
KEYTIMEOUT=1

HOST_OVERRIDE=
USER_OVERRIDE=

setopt interactivecomments

for file in $HOME/.config/zsh/*.zsh; do
	if [[ "$file" != *zshrc.zsh ]]; then
		source "$file"
	fi
done

if [[ ! -z "$USER_OVERRIDE" ]]; then
	USER_STRING="%B%F{green}${USER_OVERRIDE}%b%f"
else
	USER_STRING="%B%F{green}%n%b%f"
fi
if [[ ! -z "$HOST_OVERRIDE" ]]; then
	HOST=$HOST_OVERRIDE
fi
if [[ ! -z "$SSH_CONNECTION" ]]; then
	HOST_STRING="%B%F{cyan}%m%f%b"
else
	HOST_STRING="%B%F{magenta}%m%f%b"
fi

PROMPT_SUBST=1
PS1=$USER_STRING@$HOST_STRING$' %-1<…<%B%F{blue}%~%f%b%<<\n%(?.%F{green}$%f.%B%F{red}%? $%f%b) '

function zle-line-init zle-keymap-select {
	if [[ ${KEYMAP} == vicmd ]]; then
		echo -ne '\e[2 q' # block cursor
	elif [[ ${KEYMAP} == main ]] ||
			 [[ ${KEYMAP} == viins ]]; then
		echo -ne '\e[6 q' # vertical bar cursor
	fi
}
zle -N zle-line-init
zle -N zle-keymap-select
function preexec {
	echo -ne '\e[2 q' # block cursor
}
