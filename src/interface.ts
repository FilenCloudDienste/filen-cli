import readline from "node:readline"

export const readlineInterface = readline.createInterface({ input: process.stdin, output: process.stdout })

/**
 * Global output method
 * @param message
 */
export function out(message: string) {
    console.log(message)
}

/**
 * Global output method for JSON
 */
//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function outJson(json: any) {
    console.log(json)
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
        readlineInterface.question(message ?? "", (input) => resolve(input))
    })
}