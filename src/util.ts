// see https://stackoverflow.com/a/19448513
export function formatTimestamp(ms: number) {
	const pad2 = (n: number) => { return n < 10 ? '0' + n : n }
	const date = new Date(ms)
	return date.getFullYear().toString() + "-" + pad2(date.getMonth() + 1) + "-" + pad2( date.getDate()) + " " + pad2( date.getHours() ) + ":" + pad2( date.getMinutes() ) + ":" + pad2( date.getSeconds() ) + "." + pad2( date.getMilliseconds() )
}