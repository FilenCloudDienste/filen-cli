import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import docsJson from "./filen-cli-docs.json"
import { Feature, FeatureGroup } from "./types"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FilenCliDocs />
  </StrictMode>
)

function renderFeature(feature: Feature | FeatureGroup, depth = 0) {
  // FeatureGroup
  if ("features" in feature) {
    const featureGroup = feature as FeatureGroup
    if (featureGroup.visibility === "hide") return null
    return (
      <div className={`ml-[${depth * 6}]`} key={featureGroup.name || featureGroup.title}>
        {featureGroup.title && (
          depth === 0 ? (
            <h2 className="text-2xl font-bold mt-8 mb-2 text-white whitespace-pre-line">{featureGroup.title}</h2>
          ) : depth === 1 ? (
            <h3 className="text-xl font-bold mt-8 mb-2 text-white whitespace-pre-line">{featureGroup.title}</h3>
          ) : depth === 2 ? (
            <h4 className="text-lg font-bold mt-8 mb-2 text-white whitespace-pre-line">{featureGroup.title}</h4>
          ) : (
            <h5 className="text-base font-bold mt-8 mb-2 text-white whitespace-pre-line">{featureGroup.title}</h5>
          )
        )}
        {featureGroup.description && (
          <div className="mb-2 text-gray-300 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: featureGroup.description.replace(/`([^`]+)`/g, '<code class=\'font-mono px-1 py-0.5\'>$1</code>') }} />
        )}
        {featureGroup.longDescription && (
          <div className="my-2 whitespace-pre-line italic text-gray-400" dangerouslySetInnerHTML={{ __html: featureGroup.longDescription.replace(/`([^`]+)`/g, '<code class=\'font-mono px-1 py-0.5\'>$1</code>') }} />
        )}
        {featureGroup.features && featureGroup.features.map(f => renderFeature(f, depth + 1))}
      </div>
    )
  }
  // Feature
  const f = feature as Feature
  const isOptional = (arg: any) => arg.kind === "option" && !arg.isRequired
  const signature = [
    f.cmd[0],
    ...((f.arguments || []).map(arg => `${isOptional(arg) ? "[" : "<"}${arg.name}${arg.kind === "catch-all" ? "..." : ""}${isOptional(arg) ? "]" : ">"}`))
  ].join(" ")
  return (
    <div className={`ml-[${depth * 6}] mb-4`} key={f.cmd[0]}>
      <div className="font-mono font-semibold text-blue-400 whitespace-pre-line"><span className="text-white">&gt;</span> {signature}</div>
      {f.description && <div className="my-1 text-gray-200 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: f.description.replace(/`([^`]+)`/g, '<code class=\'font-mono px-1 py-0.5\'>$1</code>') }} />}
      {f.longDescription && (
        <div className="my-1 whitespace-pre-line italic text-gray-400" dangerouslySetInnerHTML={{ __html: f.longDescription.replace(/`([^`]+)`/g, '<code class=\'font-mono px-1 py-0.5\'>$1</code>') }} />
      )}
      {(f.arguments || []).filter(arg => arg.description).length > 0 && (
        <table className="my-2 border-collapse text-sm w-full">
          <tbody>
            {f.arguments.filter(arg => arg.description).map(arg => (
              <tr key={arg.name}>
                <td className="py-1 px-2 font-mono align-top whitespace-pre-line">
                  {isOptional(arg) ? "[" : "<"}
                  {arg.name}
                  {arg.kind === "catch-all" ? "..." : ""}
                  {isOptional(arg) ? "]" : ">"}
                </td>
                <td className="py-1 px-2 text-gray-200 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: arg.description.replace(/`([^`]+)`/g, '<code class=\'font-mono px-1 py-0.5\'>$1</code>') }} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FilenCliDocs() {
  const features = docsJson as unknown as (Feature | FeatureGroup)[]
  return (
    <div className="min-h-screen max-w-4xl mx-auto p-6 font-sans bg-black text-white">
      <h1 className="mt-10 mb-0 text-4xl font-bold text-white-200">Filen CLI Documentation</h1>
      <div className="text-gray-400 mb-6">Command reference generated from <span className="font-mono">filen --help</span></div>
      <p className="mb-10">
        <div className="flex items-center text-yellow-400 mr-2 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 20 20" stroke="currentColor">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M10 6v4m0 4h.01"/>
          </svg>
          <span className="font-semibold">Note:</span>
        </div>
        For more extensive and user-friendly docs, please visit <a href="https://docs.filen.io/docs/cli" className="text-blue-400 hover:underline">docs.filen.io</a>.
      </p>
      <hr className="my-10 border-gray-700"></hr>
      {features.map(f => renderFeature(f))}
    </div>
  )
}

const rootElement = document.getElementById("root")
if (rootElement) {
  const root = createRoot(rootElement)
  root.render(
    <StrictMode>
      <FilenCliDocs />
    </StrictMode>
  )
}

export default FilenCliDocs