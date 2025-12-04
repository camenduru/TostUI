export interface AIService {
    home: boolean
    id: string
    name: string
    description: string
    category: "image" | "video" | "3d"
    icon: string
    inputTypes: string[]
    parameters: Parameter[]
    overview: string
    documentation?: string
    codeRepository?: string
    projectPage?: string
    researchPaper?: string
    workerId: string
    cost: string
    processingTime: string
    delay: string
    examples?: { input: string[], output: string[] }
    divisible?: number
}

export interface Parameter {
  name: string
  type: "string" | "number" | "boolean" | "file" | "select" | "slider"
  label: string
  description?: string
  required?: boolean
  defaultValue?: any
  options?: string[]
  min?: number
  max?: number
  step?: number
  ui?: boolean
}

export const loadAiServices = async (): Promise<AIService[]> => {
  const response = await fetch('/api/ai-services')
  const data = await response.json()
  return data
}

export const getCategoryIcon = (category: string) => {
  switch (category) {
    case "image":
      return "Image"
    case "video":
      return "Video"
    case "3d":
      return "Box"
    default:
      return "Zap"
  }
}

export const getCategoryColor = (category: string) => {
  switch (category) {
    case "image":
      return "bg-chart-1/10 text-chart-1 border-chart-1/20"
    case "video":
      return "bg-chart-2/10 text-chart-2 border-chart-2/20"
    case "3d":
      return "bg-chart-3/10 text-chart-3 border-chart-3/20"
    default:
      return "bg-muted/10 text-muted-foreground border-muted/20"
  }
}

export const generateJobId = (): string => {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
}
