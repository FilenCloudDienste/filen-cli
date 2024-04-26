declare global {
	namespace NodeJS {
		interface Process {
			pkg: boolean
		}
	}
}

export {}
