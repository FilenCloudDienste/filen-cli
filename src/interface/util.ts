import cliProgress from "cli-progress"
import { formatBytes } from "../util"

/**
 * Display a progress bar for a file transfer.
 * @param action The action (like "Downloading", "Uploading")
 * @param file The file's name
 * @param total Total size of the file (in bytes)
 * @param isApproximate Whether to display an approximate symbol "~" before the current total
 */
export function displayTransferProgressBar(
	action: string,
	file: string,
	total: number,
	isApproximate: boolean = false
): {
	progressBar: cliProgress.SingleBar
	onProgress: (transferred: number) => void
} {
	const progressBar = new cliProgress.SingleBar(
		{
			format: `${action} ${file} [{bar}] {percentage}% | ETA: {eta_formatted} | ${isApproximate ? "~ " : ""}{value} / {total}`,
			// of a number is <= 100, it is likely a percentage; otherwise format as byte (library used here doesn't provide other options)
			formatValue: n => (n <= 100 ? n.toString() : formatBytes(n))
		},
		cliProgress.Presets.legacy
	)
	progressBar.start(total, 0)
	const onProgress = (transferred: number) => {
		progressBar.increment(transferred)
		if (progressBar.getProgress() >= 1.0) progressBar.stop()
	}
	return { progressBar, onProgress }
}