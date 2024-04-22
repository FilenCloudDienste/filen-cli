import readline from "node:readline"

const rl = readline.createInterface({input: process.stdin, output: process.stdout})

export function out(message: string) {
    console.log(message)
}

export function err(message: string) {
    console.error(message)
}

export function errExit(message: string) {
    err(message)
    process.exit()
}

export async function prompt(message?: string) {
    return new Promise<string>((resolve) => {
        rl.question(message ?? "", (input) => resolve(input))
    })
}