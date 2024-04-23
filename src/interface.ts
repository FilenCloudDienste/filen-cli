import readline from "node:readline"

const rl = readline.createInterface({input: process.stdin, output: process.stdout})

/**
 * Global output method
 * @param message
 */
export function out(message: string) {
    console.log(message)
}

/**
 * Global error output method
 * @param message
 */
export function err(message: string) {
    console.error(message)
}

/**
 * Global error output method. Exist the application
 * @param message
 */
export function errExit(message: string) {
    err(message)
    process.exit()
}

/**
 * Global input prompting method
 * @param message
 */
export async function prompt(message?: string) {
    return new Promise<string>((resolve) => {
        rl.question(message ?? "", (input) => resolve(input))
    })
}