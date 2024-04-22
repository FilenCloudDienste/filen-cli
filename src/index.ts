import arg from "arg"

const args = arg({
    // arguments
    "--help": Boolean,

    // aliases
    "-h": "--help"
})

if (args["--help"] || args["_"].length == 0) {
    console.log("Filen CLI v0.0.1")
}