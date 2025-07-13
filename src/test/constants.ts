import { CloudPath } from "../app/util/cloudPath"

export const testingRootPath = new CloudPath(["filen-cli-testing"])

export const prepareCloudFsRoot = (testRunId: string) => testingRootPath.navigate(`prepareCloudFs_${testRunId}`)
