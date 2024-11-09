function select-pair {
	local leftc=$1
	local rightc=$2
	local outer=$3

	local left=0
	local count=1
	for ((i=CURSOR; i > 0; i--)); do
		if [[ "${BUFFER[$i]}" == "$rightc" ]]; then
			let "count = count + 1"
		elif [[ "${BUFFER[$i]}" == "$leftc" ]]; then
			let "count = count - 1"
		else
			continue
		fi
		if [[ $count -le 0 ]]; then
			left=$i
			break
		fi
	done
	if [[ $left -le 0 ]]; then
		left=${BUFFER[(ie)$leftc]}
	fi
	if [[ $left -ge $(($#BUFFER+1)) ]]; then
		return
	fi
	local right=0
	local count=1
	for ((i=left+1; i <= $#BUFFER; i++)); do
		if [[ "${BUFFER[$i]}" == "$leftc" ]]; then
			let "count = count + 1"
		elif [[ "${BUFFER[$i]}" == "$rightc" ]]; then
			let "count = count - 1"
		else
			continue
		fi
		if [[ $count -le 0 ]]; then
			right=$i
			break
		fi
	done
	if [[ $right -le 0 ]]; then
		return
	fi
	if [[ $MARK -eq -1 ]]; then
		# hack: the right end of the selection has to be one larger for viopp commands?
		let "right = right + 1"
	fi
	if [[ "$outer" == "true" ]]; then
		MARK=$((left - 1))
		CURSOR=$((right - 1))
	else
		MARK=$left
		CURSOR=$((right - 2))
	fi
}

function select-single {
	local c=$1
	local outer=$2

	local left=${LBUFFER[(Ie)$c]}
	if [[ $left -le 0 ]]; then
		left=${BUFFER[(ie)$c]}
	fi
	if [[ $left -ge $(($#BUFFER+1)) ]]; then
		return
	fi
	local right=0
	local count=1
	for ((i=left+1; i <= $#BUFFER; i++)); do
		if [[ "${BUFFER[$i]}" == "$c" ]]; then
			right=$i
			break;
		fi
	done
	if [[ $right -le 0 ]]; then
		return
	fi
	if [[ $MARK -eq -1 ]]; then
		# hack: the right end of the selection has to be one larger for viopp commands?
		let "right = right + 1"
	fi
	if [[ "$outer" == "true" ]]; then
		MARK=$((left - 1))
		CURSOR=$((right - 1))
	else
		MARK=$left
		CURSOR=$((right - 2))
	fi
}

function setup-select {
	key="$1"
	name="$2"
	zle -N "select-a-$name"
	zle -N "select-i-$name"
	bindkey -M visual "a$key" "select-a-$name"
	bindkey -M viopp "a$key" "select-a-$name"
	bindkey -M visual "i$key" "select-i-$name"
	bindkey -M viopp "i$key" "select-i-$name"
}

function select-a-s-block { select-pair '[' ']' true }
function select-i-s-block { select-pair '[' ']' false }
function select-a-p-block { select-pair '(' ')' true }
function select-i-p-block { select-pair '(' ')' false }
function select-a-a-block { select-pair '<' '>' true }
function select-i-a-block { select-pair '<' '>' false }
function select-a-b-block { select-pair '{' '}' true }
function select-i-b-block { select-pair '{' '}' false }
setup-select '[' s-block
setup-select ']' s-block
setup-select '(' p-block
setup-select ')' p-block
setup-select '<' a-block
setup-select '>' a-block
setup-select '{' b-block
setup-select '}' b-block

function select-a-dquote { select-single '"' true }
function select-i-dquote { select-single '"' false }
function select-a-squote { select-single \' true }
function select-i-squote { select-single \' false }
function select-a-bquote { select-single '`' true }
function select-i-bquote { select-single '`' false }
setup-select '"' dquote
setup-select \' squote
setup-select '`' bquote
