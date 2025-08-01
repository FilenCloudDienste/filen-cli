import dateFormat from "dateformat"
import { randomUUID } from "crypto"
import { cleanupCloudFs } from "./fsTests"

// used for prepareCloudFs root directory
export const testRunId = dateFormat(new Date(), "yyyy-mm-dd_HH-MM-ss") + "_" + randomUUID().slice(0, 8)

// runs asynchronously
cleanupCloudFs()