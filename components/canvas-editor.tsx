"use client"

// Declare model-viewer web component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        alt?: string
        'camera-controls'?: boolean
        'auto-rotate'?: boolean
        debug?: boolean
        style?: React.CSSProperties
        onError?: (e: Event) => void
        onLoad?: () => void
      }
    }
  }
}

import React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Upload,
  Download,
  Trash2,
  MousePointer2,
  ChevronUp,
  ChevronDown,
  Layers,
  ChevronsUp,
  ChevronsDown,
  Undo,
  Redo,
  GripVertical,
  Settings,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Sliders,
  ChevronDown as ChevronDownIcon,
  Eye,
  EyeOff,
  Image,
  Type,
  Plus,
  Search,
  X,
  Grid3X3,
  ImageIcon,
  Video,
  Box,
  AudioWaveform,
  MessageSquare,
  Zap,
  Camera,
  FileText,
  Github,
  ExternalLink,
  BookOpen,
  Wallet,
  CreditCard,
  Book,
  Scissors,
  Earth,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { GLBViewerWindow } from "./glb-viewer-window"
import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'
import { AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers'

// Dynamically import model-viewer to avoid SSR issues
const ModelViewer = dynamic(() => import('@google/model-viewer').then(() => {
  // Return a component that renders the model-viewer
  return ({ children, ...props }: any) => {
    // Use React.createElement to avoid TypeScript issues
    return React.createElement('model-viewer', props, children)
  }
}), {
  ssr: false,
  loading: () => <div className="w-full h-40 bg-muted animate-pulse rounded border flex items-center justify-center text-sm text-muted-foreground">Loading 3D viewer...</div>
})

// Import services from local lib
import { loadAiServices, getCategoryColor, getCategoryIcon, type AIService } from "@/lib/ai-services"

// Local API allowed services
const TOST_UI_LOCAL_API_SERVICES = process.env.NEXT_PUBLIC_TOST_UI_LOCAL_API_SERVICES ? process.env.NEXT_PUBLIC_TOST_UI_LOCAL_API_SERVICES.split(',') : []

type LayerType = 'image' | 'text' | 'video' | 'glb'

interface Layer {
    id: string
    type: LayerType
    // For image layers
    image?: HTMLImageElement
    // For text layers
    text?: string
    fontSize?: number
    fontFamily?: string
    color?: string
    // For video layers
    video?: HTMLVideoElement
    videoUrl?: string
    currentTime?: number
    duration?: number
    isPlaying?: boolean
    // For GLB layers
    glbUrl?: string
    // For GLB thumbnails
    isGlbThumbnail?: boolean
    // For AI-generated layers
    delayTime?: number
    executionTime?: number
    prompt?: string
    instruction?: string
    resultUrl?: string
    serviceId?: string
    // Billing information
    billing?: {
      costPerSecond: number
      deducted: number
      remaining: number
    }
    x: number
    y: number
    width: number
    height: number
    rotation: number
    name: string
    visible: boolean
  }

interface ConversionOptions {
  prompt: string
  instruction: string
  loraModel: string
  layerName: string
}

interface HistoryState {
  layers: Layer[]
  selectedLayerIds: string[] // Changed from selectedLayerId to selectedLayerIds array
}

type Tool = "select" | "pan"
type Handle = "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w" | "rotate" | null

const generateJobId = (): string => {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
}

// Helper function to process error messages
const processErrorMessage = (errorData: any): string => {
  if (typeof errorData === 'string') {
    try {
      const parsed = JSON.parse(errorData)
      if (parsed.error_message) {
        // Log full error details to console
        console.error('Full error details:', parsed)
        // Return short message
        return `${parsed.error_type?.replace(/<class '(\w+)'>/, '$1') || 'Error'}: ${parsed.error_message}`
      }
      return parsed.error || errorData
    } catch (e) {
      return errorData
    }
  }
  return errorData?.error || errorData?.message || 'Unknown error'
}

export function CanvasEditor() {
  const { resolvedTheme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layerInputRef = useRef<HTMLInputElement>(null)
  const hostnameContainsTostAi = typeof window !== 'undefined' && window.location.hostname.includes(process.env.NEXT_PUBLIC_TOST_AI_CONTAINS_URL ?? 'tost.ai')

  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  const [tool, setTool] = useState<Tool>("select")

  const [history, setHistory] = useState<HistoryState[]>([{ layers: [], selectedLayerIds: [] }])
  const [historyIndex, setHistoryIndex] = useState(0)

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [activeHandle, setActiveHandle] = useState<Handle>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialLayerState, setInitialLayerState] = useState<Layer | null>(null)
  const [initialDragPositions, setInitialDragPositions] = useState<Record<string, {x: number, y: number}> | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 })
  const [canvasDisplaySize, setCanvasDisplaySize] = useState({ width: 1200, height: 800 })
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const [showParametersPanel, setShowParametersPanel] = useState(true)
  const [showTimelinePanel, setShowTimelinePanel] = useState(false)

  const [isDragOver, setIsDragOver] = useState(false)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null)

  const [isDuplicating, setIsDuplicating] = useState(false)

  // Touch handling state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null)
  const [initialZoom, setInitialZoom] = useState<number>(1)

  // Service job tracking for multiple concurrent executions
  interface ServiceJob {
    id: string // Internal job ID for tracking
    tostaiJobId?: string // TostAI job ID for API calls
    serviceId: string
    serviceName: string
    progress: number
    status: string
    apiStatus: string
    result: any
    timing: {delayTime?: number, executionTime?: number} | null
    options: ConversionOptions | null
    polling: boolean
    layerId?: string // Reference to input layer for positioning results
    inputLayer?: Layer // Store the actual layer data as backup
  }

  const [serviceJobs, setServiceJobs] = useState<ServiceJob[]>([])

  // Service parameters
  const [serviceFormData, setServiceFormData] = useState<Record<string, any>>({})
  const [serviceWebhookUrl, setServiceWebhookUrl] = useState<string>("")
  const [serviceTostaiToken, setServiceTostaiToken] = useState<string>("")
  const [tokenRemaining, setTokenRemaining] = useState<number | null>(null)
  const [maxDimension, setMaxDimension] = useState<number>(1024)
  const [maxDimensionEnabled, setMaxDimensionEnabled] = useState<boolean>(true)
  const [showApiConfig, setShowApiConfig] = useState<boolean>(true)
  const [showGenerateEmptyImage, setShowGenerateEmptyImage] = useState<boolean>(false)
  const [customWidth, setCustomWidth] = useState<number>(1024)
  const [customHeight, setCustomHeight] = useState<number>(1024)
  const [customAspectRatio, setCustomAspectRatio] = useState<string>("3:1")
  const [customBaseSize, setCustomBaseSize] = useState<number>(1024)
  const [forceRedraw, setForceRedraw] = useState(0)
  const [textFileContents, setTextFileContents] = useState<Record<string, string>>({})
  const [useLocalApi, setUseLocalApi] = useState<boolean>(false)
  const [localApiUrl, setLocalApiUrl] = useState<string>("http://localhost:8000")
  const [localUploadUrl, setLocalUploadUrl] = useState<string>("http://localhost:9000")
  const [uiScale, setUiScale] = useState<number>(100)

  // Cache for background removal models
  const [bgRemovalModels, setBgRemovalModels] = useState<{model: any, processor: any} | null>(null)
  const [bgRemovalQueue, setBgRemovalQueue] = useState<string[]>([])
  const [isBgRemovalProcessing, setIsBgRemovalProcessing] = useState(false)
  const [currentProcessingLayer, setCurrentProcessingLayer] = useState<string | null>(null)

  // Video playback state
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set())
  const animationFrameRef = useRef<number | null>(null)
  const lastDrawTime = useRef<number>(0)
  const isSeekingRef = useRef<Record<string, boolean>>({})
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({})
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 })

  // Track processed GLB URLs to prevent duplicate thumbnail generation
  const processedGlbUrls = useRef<Set<string>>(new Set())

  // GLB viewer state
  const [showGlbViewer, setShowGlbViewer] = useState(false)
  const [currentGlbUrl, setCurrentGlbUrl] = useState<string | null>(null)
  const [currentGlbTitle, setCurrentGlbTitle] = useState<string>("")
  const [currentGlbPosition, setCurrentGlbPosition] = useState<{ x: number; y: number }>({ x: 100, y: 100 })
  const [currentGlbSize, setCurrentGlbSize] = useState<{ width: number; height: number }>({ width: 600, height: 500 })

  // Function to generate dummy box thumbnail as fallback
  const generateDummyBoxThumbnail = useCallback(async (): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        const img = document.createElement('img')
        img.onload = () => resolve(img)
        img.src =
          'data:image/svg+xml;base64,' +
          btoa(`
          <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#e3f2fd"/>
            <text x="50%" y="50%" font-size="64" text-anchor="middle" fill="#2196f3" dy=".35em">
              3D File
            </text>
          </svg>
        `)
        return
      }

      // Background
      ctx.fillStyle = '#e3f2fd'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const text = '3D File'
      const x = 256
      const y = 280
      const depth = 20

      ctx.font = 'bold 96px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Draw depth (shadow layers)
      for (let i = depth; i > 0; i--) {
        ctx.fillStyle = `rgb(25, 118, 210)`
        ctx.fillText(text, x + i, y + i)
      }

      // Front face
      ctx.fillStyle = '#2196f3'
      ctx.fillText(text, x, y)

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fillText(text, x - 3, y - 3)

      const img = document.createElement('img')
      img.onload = () => resolve(img)
      img.src = canvas.toDataURL('image/png')
    })
  }, [])


  // Function to generate GLB thumbnail
  const generateGLBThumbnail = useCallback(async (glbUrl: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      // Create temporary model-viewer
      const tempDiv = document.createElement('div')
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '0'
      tempDiv.style.top = '0'
      tempDiv.style.width = '800px'
      tempDiv.style.height = '600px'
      tempDiv.style.opacity = '0'
      tempDiv.style.pointerEvents = 'none'
      tempDiv.style.zIndex = '-1'
      document.body.appendChild(tempDiv)

      const modelViewer = document.createElement('model-viewer')
      modelViewer.src = glbUrl
      modelViewer.style.width = '100%'
      modelViewer.style.height = '100%'
      modelViewer.style.backgroundColor = 'transparent'
      modelViewer.setAttribute('camera-controls', 'false')
      modelViewer.setAttribute('auto-rotate', 'false')
      tempDiv.appendChild(modelViewer)

      const cleanup = () => {
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv)
        }
      }

      modelViewer.addEventListener('load', async () => {
        try {
          // Wait a bit for rendering
          await new Promise(resolve => setTimeout(resolve, 2000))

          const blob = await modelViewer.toBlob({
            mimeType: 'image/png'
          })

          if (blob) {
            const img = document.createElement('img')
            img.onload = () => {
              cleanup()
              resolve(img)
            }
            img.onerror = () => {
              cleanup()
              reject(new Error('Failed to load thumbnail'))
            }
            img.src = URL.createObjectURL(blob)
          } else {
            cleanup()
            reject(new Error('Failed to capture GLB'))
          }
        } catch (error) {
          cleanup()
          reject(error)
        }
      })

      modelViewer.addEventListener('error', (e) => {
        cleanup()
        reject(new Error('Failed to load GLB'))
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        cleanup()
        reject(new Error('Timeout generating thumbnail'))
      }, 10000)
    })
  }, [])

  // Generate thumbnails for GLB layers automatically
  useEffect(() => {
    const generateThumbnails = async () => {
      const glbLayers = layers.filter(layer =>
        layer.type === 'glb' &&
        layer.glbUrl &&
        !processedGlbUrls.current.has(layer.glbUrl)
      )
      if (glbLayers.length === 0) return

      for (const layer of glbLayers) {
        processedGlbUrls.current.add(layer.glbUrl!)
        try {
          const thumbnail = await generateGLBThumbnail(layer.glbUrl!)
          const croppedThumbnail = await cropTransparent(thumbnail)
          // Create a new image layer for the thumbnail
          const thumbnailLayer: Layer = {
            id: `layer-glb-thumb-${Date.now()}-${Math.random()}`,
            type: 'image',
            image: croppedThumbnail,
            x: layer.x + layer.width + 20, // Position next to the GLB layer
            y: layer.y,
            width: croppedThumbnail.width,
            height: croppedThumbnail.height,
            rotation: 0,
            name: `${layer.name} Thumbnail`,
            visible: true,
            isGlbThumbnail: true,
            glbUrl: layer.glbUrl,
          }
          setLayers(prev => [...prev, thumbnailLayer])
        } catch (error) {
          console.error('Failed to generate GLB thumbnail:', error)
          // Use dummy box thumbnail as fallback
          try {
            const dummyThumbnail = await generateDummyBoxThumbnail()
            const croppedDummyThumbnail = await cropTransparent(dummyThumbnail)
            // Create a new image layer for the dummy thumbnail
            const thumbnailLayer: Layer = {
              id: `layer-glb-thumb-${Date.now()}-${Math.random()}`,
              type: 'image',
              image: croppedDummyThumbnail,
              x: layer.x + layer.width + 20, // Position next to the GLB layer
              y: layer.y,
              width: croppedDummyThumbnail.width,
              height: croppedDummyThumbnail.height,
              rotation: 0,
              name: `${layer.name} Thumbnail`,
              visible: true,
              isGlbThumbnail: true,
              glbUrl: layer.glbUrl,
            }
            setLayers(prev => [...prev, thumbnailLayer])
          } catch (dummyError) {
            console.error('Failed to generate dummy thumbnail:', dummyError)
          }
          // Remove from processed if failed, so it can retry
          processedGlbUrls.current.delete(layer.glbUrl!)
        }
      }
    }

    generateThumbnails()
  }, [layers, generateGLBThumbnail])

  // Service Properties resize functionality
  const [servicePropertiesHeight, setServicePropertiesHeight] = useState(128) // Default height in pixels
  const [isResizingProperties, setIsResizingProperties] = useState(false)
  const [resizeStartY, setResizeStartY] = useState(0)
  const [resizeStartHeight, setResizeStartHeight] = useState(128)
  const resizeHandleRef = useRef<HTMLDivElement>(null)

  // AI Services state - initialize with default services from aiServices array
  const [aiServices, setAiServices] = useState<any[]>([])
  const [availableServices, setAvailableServices] = useState<AIService[]>([])


  // Service selection modal state
  const [showServiceSelector, setShowServiceSelector] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [serviceSearchQuery, setServiceSearchQuery] = useState("")
  const [serviceSelectedCategory, setServiceSelectedCategory] = useState<string>("all")
  const [serviceSelectorView, setServiceSelectorView] = useState<"services" | "examples">("services")
  const [selectedServiceForExamples, setSelectedServiceForExamples] = useState<AIService | null>(null)

  // Allowed services based on use local api toggle
  const allowedServices = useLocalApi ? TOST_UI_LOCAL_API_SERVICES : availableServices.filter(s => s.workerId && s.workerId.trim() !== '').map(s => s.id)

  // Filtered services for the selector
  const filteredAvailableServices = availableServices.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()) ||
      service.description.toLowerCase().includes(serviceSearchQuery.toLowerCase())
    const matchesCategory = serviceSelectedCategory === "all" || service.category === serviceSelectedCategory
    const isAllowed = allowedServices.includes(service.id)
    return matchesSearch && matchesCategory && isAllowed
  })

  // Service categories for the selector
  const serviceCategories = [
    { id: "all", name: "All Services", count: filteredAvailableServices.length },
    { id: "image", name: "Image", count: filteredAvailableServices.filter((s) => s.category === "image").length },
    { id: "video", name: "Video", count: filteredAvailableServices.filter((s) => s.category === "video").length },
    { id: "3d", name: "3D", count: filteredAvailableServices.filter((s) => s.category === "3d").length },
  ].filter(category => category.count > 0)
  
  // Function to get the actual icon component from string name
  const getServiceIconComponent = (iconName: string) => {
    switch (iconName) {
      case "Box": return Box
      case "MessageSquare": return MessageSquare
      case "Image": return ImageIcon
      case "Video": return Video
      case "AudioWaveform": return AudioWaveform
      case "RefreshCw": return RefreshCw
      case "Zap": return Zap
      case "Camera": return Camera
      case "Grid3X3": return Grid3X3
      default: return Zap
    }
  }

  // Handle service selection from the modal
  const handleServiceSelect = (service: AIService) => {
    // Check if service already exists
    const serviceExists = aiServices.some(s => s.id === service.id)

    if (serviceExists) {
      // Service already exists, just close the modal
      setShowServiceSelector(false)
      setServiceSelectorView("services")
      setSelectedServiceForExamples(null)
      setServiceSearchQuery("")
      setServiceSelectedCategory("all")
      return
    }

    // Create service with all parameters from the service definition
    const newService = {
      id: service.id,
      name: service.name,
      category: service.category,
      icon: service.icon,
      inputTypes: service.inputTypes,
      parameters: service.parameters, // Include all parameters
      workerId: service.workerId,
      cost: service.cost,
      processingTime: service.processingTime,
      delay: service.delay,
      divisible: service.divisible,
      // Initialize parameter values with defaults from defaultValue
      ...Object.fromEntries(
        service.parameters.map(param => [
          param.name,
          param.defaultValue ?? ''
        ])
      )
    }

    setAiServices(prev => [...prev, newService])

    // Select the newly added service
    setSelectedServiceId(service.id)

    // Populate service form data with default values
    const formData: Record<string, any> = {}
    service.parameters.forEach(param => {
      if (param.name !== 'job_id') {
        formData[param.name] = param.defaultValue ?? ''
      }
    })
    setServiceFormData(formData)

    setShowServiceSelector(false)
    setServiceSelectorView("services")
    setSelectedServiceForExamples(null)
    setServiceSearchQuery("")
    setServiceSelectedCategory("all")
  }

  // Handle viewing examples for a service
  const handleViewExamples = (service: AIService) => {
    setSelectedServiceForExamples(service)
    setServiceSelectorView("examples")

    // Automatically load text content for examples
    if (service.examples) {
      const textFilesToLoad = [
        ...service.examples.input.filter(path => path.toLowerCase().endsWith('.txt')).map(path => ({
          path,
          key: getTextFileKey(service.id, 'input', path)
        })),
        ...service.examples.output.filter(path => path.toLowerCase().endsWith('.txt')).map(path => ({
          path,
          key: getTextFileKey(service.id, 'output', path)
        }))
      ]

      textFilesToLoad.forEach(({ path, key }) => {
        loadTextFileContent(path, key)
      })
    }
  }

  // Handle going back to services view
  const handleBackToServices = () => {
    setServiceSelectorView("services")
    setSelectedServiceForExamples(null)
  }
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [draggedServiceId, setDraggedServiceId] = useState<string | null>(null)
  const [dragOverServiceId, setDragOverServiceId] = useState<string | null>(null)

  const selectedLayers = selectedLayerIds.map(id => layers.find(l => l.id === id)).filter(Boolean) as Layer[]
  const primarySelectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null
  const selectedTextLayer = primarySelectedLayer && primarySelectedLayer.type === 'text' ? primarySelectedLayer : null

  // Check if the primary selected layer has transparency
  const hasTransparency = (layer: Layer | null): boolean => {
    if (!layer || layer.type !== 'image' || !layer.image) return false

    try {
      const canvas = document.createElement("canvas")
      canvas.width = layer.image.width
      canvas.height = layer.image.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return false

      ctx.drawImage(layer.image, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Check if any pixel has alpha < 255
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true
      }
      return false
    } catch (error) {
      return false
    }
  }


  const saveToHistory = (newLayers: Layer[], newSelectedIds: string[]) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push({ layers: newLayers, selectedLayerIds: newSelectedIds })
    if (newHistory.length > 50) {
      newHistory.shift()
    } else {
      setHistoryIndex(historyIndex + 1)
    }
    setHistory(newHistory)
  }

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      const state = history[newIndex]
      setLayers(state.layers)
      setSelectedLayerIds(state.selectedLayerIds)
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      const state = history[newIndex]
      setLayers(state.layers)
      setSelectedLayerIds(state.selectedLayerIds)
    }
  }

  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const scale = uiScale / 100
        const displayWidth = containerRef.current.clientWidth
        const displayHeight = containerRef.current.clientHeight
        const logicalWidth = displayWidth / scale
        const logicalHeight = displayHeight / scale

        console.log('Canvas size update:', {
          uiScale,
          scale,
          displaySize: { width: displayWidth, height: displayHeight },
          logicalSize: { width: logicalWidth, height: logicalHeight },
          modalSize: {
            width: Math.min(logicalWidth * 0.95, window.innerWidth * 0.9),
            height: Math.min(logicalHeight * 0.95, window.innerHeight * 0.85)
          }
        })

        setCanvasSize(prev => {
          if (prev.width !== logicalWidth || prev.height !== logicalHeight) {
            return { width: logicalWidth, height: logicalHeight }
          }
          return prev
        })

        setCanvasDisplaySize(prev => {
          if (prev.width !== displayWidth || prev.height !== displayHeight) {
            return { width: displayWidth, height: displayHeight }
          }
          return prev
        })
      }
    }

    updateCanvasSize()
    window.addEventListener("resize", updateCanvasSize)
    return () => window.removeEventListener("resize", updateCanvasSize)
  }, [showLayerPanel, showParametersPanel, showTimelinePanel, uiScale])

  // Initialize service form data and load settings
  useEffect(() => {
    // Load API settings from localStorage
    const savedToken = localStorage.getItem("tostai_token") || ""
    const savedWebhook = localStorage.getItem("webhook_url") || ""
    const savedMaxDimension = parseInt(localStorage.getItem("max_dimension") || "1024")
    const savedUseLocalApiValue = localStorage.getItem("use_local_api")
    const savedUseLocalApi = savedUseLocalApiValue !== null ? savedUseLocalApiValue === "true" : !hostnameContainsTostAi
    const savedLocalApiUrl = localStorage.getItem("local_api_url") || "http://localhost:8000"
    const savedLocalUploadUrl = localStorage.getItem("local_upload_url") || "http://localhost:9000"
    const savedUiScale = parseInt(localStorage.getItem("ui_scale") || "100")
    setServiceTostaiToken(savedToken)
    setServiceWebhookUrl(savedWebhook)
    setMaxDimension(savedMaxDimension)
    setUseLocalApi(savedUseLocalApi)
    setLocalApiUrl(savedLocalApiUrl)
    setLocalUploadUrl(savedLocalUploadUrl)
    setUiScale(savedUiScale)

    // Hide API config panel if settings are saved (token for TostAI, or local API enabled)
    if ((savedToken && !savedUseLocalApi) || savedUseLocalApi) {
      setShowApiConfig(false)
    }

    // Set client-side flag and show modal after hydration
    setIsClient(true)
    setShowServiceSelector(true)
  }, [])

  // Load AI services from JSON
  useEffect(() => {
    const loadServices = async () => {
      try {
        const services = await loadAiServices()
        setAvailableServices(services)
      } catch (error) {
        console.error('Failed to load AI services:', error)
      }
    }
    loadServices()
  }, [])

  // Apply UI scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale}%`
  }, [uiScale])

  // Ensure model-viewer library is loaded for GLB thumbnail generation
  useEffect(() => {
    import('@google/model-viewer')
  }, [])


  // Clear selected service when switching API modes
  useEffect(() => {
    setSelectedServiceId(null)
  }, [useLocalApi])

  // Initialize AI services based on use local api toggle
  useEffect(() => {
    const allowedServices = useLocalApi ? TOST_UI_LOCAL_API_SERVICES : availableServices.filter(s => s.home && s.workerId && s.workerId.trim() !== '').map(s => s.id)

    const filteredServices = availableServices
      .filter(service => allowedServices.includes(service.id))
      .map(service => ({
        id: service.id,
        name: service.name,
        category: service.category,
        icon: service.icon,
        inputTypes: service.inputTypes,
        parameters: service.parameters,
        workerId: service.workerId,
        cost: service.cost,
        processingTime: service.processingTime,
        delay: service.delay,
        divisible: service.divisible,
        // Initialize parameter values with defaults from defaultValue
        ...Object.fromEntries(
          service.parameters.map(param => [
            param.name,
            param.defaultValue ?? ''
          ])
        )
      }))

    setAiServices(filteredServices)
  }, [useLocalApi, availableServices])

  // Update service width/height to match selected layer dimensions (only if custom size disabled)
  useEffect(() => {
    if (selectedServiceId && primarySelectedLayer) {
      setAiServices(prev => prev.map(s => {
        if (s.id === selectedServiceId) {
          // Only update if custom_size is disabled (false or undefined)
          const customSizeDisabled = !s.custom_size

          return {
            ...s,
            width: customSizeDisabled ? primarySelectedLayer.width : s.width,
            height: customSizeDisabled ? primarySelectedLayer.height : s.height
          }
        }
        return s
      }))
    }
  }, [selectedServiceId, primarySelectedLayer])



  // Handle paste image from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault()
          const blob = items[i].getAsFile()
          if (blob) {
            try {
              const img = await loadImage(blob)

              // Crop transparent parts
              const croppedImg = await cropTransparent(img)

              // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
              const aspectRatio = croppedImg.width / croppedImg.height

              let width: number, height: number
              if (maxDimensionEnabled) {
                if (croppedImg.width > croppedImg.height) {
                  // Landscape image
                  width = Math.min(croppedImg.width, maxDimension)
                  height = width / aspectRatio
                } else {
                  // Portrait or square image
                  height = Math.min(croppedImg.height, maxDimension)
                  width = height * aspectRatio
                }
              } else {
                // Use original dimensions
                width = croppedImg.width
                height = croppedImg.height
              }

              // Ensure they are divisible by 4
              width = Math.ceil(width / 4) * 4
              height = Math.ceil(height / 4) * 4

              // Calculate center position
              const canvas = canvasRef.current
              let centerX = 200, centerY = 200
              if (canvas) {
                const rect = canvas.getBoundingClientRect()
                centerX = (rect.width / 2 - pan.x) / zoom
                centerY = (rect.height / 2 - pan.y) / zoom
              }

              const newLayer: Layer = {
                id: `layer-paste-${Date.now()}`,
                type: 'image',
                image: croppedImg,
                x: centerX - width / 2,
                y: centerY - height / 2,
                width,
                height,
                rotation: 0,
                name: 'Pasted Image',
                visible: true,
              }

              const updatedLayers = [...layers, newLayer]
              setLayers(updatedLayers)
              setSelectedLayerIds([newLayer.id])
              saveToHistory(updatedLayers, [newLayer.id])
            } catch (error) {
              console.error('Failed to paste image:', error)
            }
          }
          break // Only handle the first image
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [layers, pan, zoom, maxDimensionEnabled, maxDimension])

  const drawCanvas = (hideSelection = false, drawBackground = true) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return


    // Ensure canvas is properly sized first
    const rect = canvas.getBoundingClientRect()
    const devicePixelRatio = window.devicePixelRatio || 1
    const width = rect.width * devicePixelRatio
    const height = rect.height * devicePixelRatio

    // Resize canvas if needed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    // Clear the entire canvas completely
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Reset transformation matrix to identity
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

    if (drawBackground) {
      const squareSize = 20
      const isDark = resolvedTheme === 'dark'
      const color1 = isDark ? '#1a1a1a' : '#f5f5f5'
      const color2 = isDark ? '#121212' : '#ffffff'
      for (let y = 0; y < canvas.height; y += squareSize) {
        for (let x = 0; x < canvas.width; x += squareSize) {
          ctx.fillStyle = (x / squareSize + y / squareSize) % 2 === 0 ? color1 : color2
          ctx.fillRect(x, y, squareSize, squareSize)
        }
      }
    }

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

    // Draw only visible layers that exist in current layers array
     const visibleLayers = layers.filter(layer => layer.visible && (
       (layer.type === 'image' && layer.image && layer.image.complete) ||
       (layer.type === 'text' && layer.text) ||
       (layer.type === 'video' && layer.video)
     ))

    visibleLayers.forEach((layer) => {
      try {
        ctx.save()
        ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
        ctx.rotate((layer.rotation * Math.PI) / 180)

        if (layer.type === 'image' && layer.image) {
          ctx.drawImage(layer.image, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
        } else if (layer.type === 'text' && layer.text) {
          ctx.font = `${layer.fontSize || 24}px ${layer.fontFamily || 'Arial'}`
          ctx.fillStyle = layer.color || '#000000'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(layer.text, 0, 0)
        } else if (layer.type === 'video' && layer.video) {
          ctx.drawImage(layer.video, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
        } else if (layer.type === 'glb' && layer.image) {
          ctx.drawImage(layer.image, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
        }

        ctx.restore()
      } catch (error) {
        // Failed to draw layer - silently continue
      }
    })

    if (!hideSelection && selectedLayers.length > 0) {
      selectedLayers.filter(layer => layer.type !== 'glb').forEach((layer) => {
        ctx.save()
        ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
        ctx.rotate((layer.rotation * Math.PI) / 180)

        ctx.strokeStyle = "#6366f1"
        ctx.lineWidth = 2 / zoom
        ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height)

        if (selectedLayers.length === 1) {
          const handleSize = 8 / zoom
          const handles = [
            { x: -layer.width / 2, y: -layer.height / 2 },
            { x: layer.width / 2, y: -layer.height / 2 },
            { x: -layer.width / 2, y: layer.height / 2 },
            { x: layer.width / 2, y: layer.height / 2 },
          ]

          handles.forEach((handle) => {
            ctx.fillStyle = "#ffffff"
            ctx.strokeStyle = "#6366f1"
            ctx.lineWidth = 2 / zoom
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
          })

          const edgeHandles = [
            { x: 0, y: -layer.height / 2 },
            { x: layer.width / 2, y: 0 },
            { x: 0, y: layer.height / 2 },
            { x: -layer.width / 2, y: 0 },
          ]

          edgeHandles.forEach((handle) => {
            ctx.fillStyle = "#ffffff"
            ctx.strokeStyle = "#6366f1"
            ctx.lineWidth = 2 / zoom
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
          })

          const rotateHandleDistance = 30
          ctx.beginPath()
          ctx.moveTo(0, -layer.height / 2)
          ctx.lineTo(0, -layer.height / 2 - rotateHandleDistance)
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2 / zoom
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(0, -layer.height / 2 - rotateHandleDistance, 6 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = "#ffffff"
          ctx.fill()
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 2 / zoom
          ctx.stroke()
        }

        ctx.restore()
      })
    }

    ctx.restore()
  }

  useEffect(() => {
    drawCanvas()
  }, [layers, selectedLayerIds, canvasSize, zoom, pan, forceRedraw, resolvedTheme])

  // Manage video playback loop
  useEffect(() => {
    if (playingVideos.size > 0) {
      startVideoLoop()
    } else {
      stopVideoLoop()
    }

    return () => stopVideoLoop()
  }, [playingVideos.size])

  // Show timeline panel when video layers are present
  useEffect(() => {
    if (layers.some(layer => layer.type === 'video')) {
      setShowTimelinePanel(true)
    }
  }, [layers])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoLoop()
      // Pause all videos
      layers.forEach(layer => {
        if (layer.type === 'video' && layer.video) {
          layer.video.pause()
        }
      })
    }
  }, [])

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  const handleLayerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return

      const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
      const videoFiles = Array.from(files).filter(file => file.type.startsWith('video/'))
      const glbFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf'))

     // Handle video files
     if (videoFiles.length > 0) {
       const canvas = canvasRef.current
       if (!canvas) return

       // Calculate center position of the visible canvas area
       const rect = canvas.getBoundingClientRect()
       const centerX = (rect.width / 2 - pan.x) / zoom
       const centerY = (rect.height / 2 - pan.y) / zoom

       const newLayers: Layer[] = []
       for (let i = 0; i < videoFiles.length; i++) {
         const file = videoFiles[i]
         const video = document.createElement('video')
         video.preload = 'auto'
         video.src = URL.createObjectURL(file)
         video.muted = true // Required for autoplay in some browsers

         // Handle duration updates when metadata loads
         const handleMetadataLoaded = () => {
           // Update duration in existing layer if it exists
           setLayers(currentLayers => {
             return currentLayers.map(layer => {
               if (layer.type === 'video' && layer.video === video && (!layer.duration || layer.duration !== video.duration)) {
                 return { ...layer, duration: video.duration }
               }
               return layer
             })
           })
         }

         video.addEventListener('loadedmetadata', handleMetadataLoaded)
         video.addEventListener('durationchange', handleMetadataLoaded)

         await new Promise<void>((resolve) => {
           video.onloadeddata = () => {
             // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
             const aspectRatio = video.videoWidth / video.videoHeight

             let width: number, height: number
             if (maxDimensionEnabled) {
               if (video.videoWidth > video.videoHeight) {
                 // Landscape video
                 width = Math.min(video.videoWidth, maxDimension)
                 height = width / aspectRatio
               } else {
                 // Portrait or square video
                 height = Math.min(video.videoHeight, maxDimension)
                 width = height * aspectRatio
               }
             } else {
               // Use original dimensions
               width = video.videoWidth
               height = video.videoHeight
             }

             // Ensure they are divisible by 4
             width = Math.ceil(width / 4) * 4
             height = Math.ceil(height / 4) * 4

             // Arrange videos in a grid pattern around the center
             const cols = Math.ceil(Math.sqrt(videoFiles.length))
             const rows = Math.ceil(videoFiles.length / cols)
             const colIndex = i % cols
             const rowIndex = Math.floor(i / cols)

             const spacing = 320 // Space between videos
             const offsetX = (colIndex - (cols - 1) / 2) * spacing
             const offsetY = (rowIndex - (rows - 1) / 2) * spacing

             const newLayer: Layer = {
               id: `layer-video-${Date.now()}-${i}`,
               type: 'video',
               video: video,
               videoUrl: URL.createObjectURL(file),
               currentTime: 0,
               duration: video.duration || 0, // Use 0 as fallback if duration not available yet
               isPlaying: false,
               x: centerX - width / 2 + offsetX,
               y: centerY - height / 2 + offsetY,
               width,
               height,
               rotation: 0,
               name: file.name,
               visible: true,
             }

             newLayers.push(newLayer)
             resolve()
           }
         })
       }

       const updatedLayers = [...layers, ...newLayers]
       setLayers(updatedLayers)
       setSelectedLayerIds([newLayers[newLayers.length - 1].id])
       saveToHistory(updatedLayers, [newLayers[newLayers.length - 1].id])
     }

     // Handle GLB files
     if (glbFiles.length > 0) {
       const canvas = canvasRef.current
       if (!canvas) return

       // Calculate center position of the visible canvas area
       const rect = canvas.getBoundingClientRect()
       const centerX = (rect.width / 2 - pan.x) / zoom
       const centerY = (rect.height / 2 - pan.y) / zoom

       const newLayers: Layer[] = []
       for (let i = 0; i < glbFiles.length; i++) {
         const file = glbFiles[i]
         const glbUrl = URL.createObjectURL(file)

         try {
           const thumbnail = await generateGLBThumbnail(glbUrl)
           const croppedThumbnail = await cropTransparent(thumbnail)

           // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
           const aspectRatio = croppedThumbnail.width / croppedThumbnail.height

           let width: number, height: number
           if (maxDimensionEnabled) {
             if (croppedThumbnail.width > croppedThumbnail.height) {
               // Landscape thumbnail
               width = Math.min(croppedThumbnail.width, maxDimension)
               height = width / aspectRatio
             } else {
               // Portrait or square thumbnail
               height = Math.min(croppedThumbnail.height, maxDimension)
               width = height * aspectRatio
             }
           } else {
             // Use original dimensions
             width = croppedThumbnail.width
             height = croppedThumbnail.height
           }

           // Ensure they are divisible by 4
           width = Math.ceil(width / 4) * 4
           height = Math.ceil(height / 4) * 4

           // Arrange thumbnails in a grid pattern around the center
           const cols = Math.ceil(Math.sqrt(glbFiles.length))
           const rows = Math.ceil(glbFiles.length / cols)
           const colIndex = i % cols
           const rowIndex = Math.floor(i / cols)

           const spacing = 320 // Space between thumbnails
           const offsetX = (colIndex - (cols - 1) / 2) * spacing
           const offsetY = (rowIndex - (rows - 1) / 2) * spacing

           const newLayer: Layer = {
             id: `layer-glb-thumb-${Date.now()}-${i}`,
             type: 'image',
             image: croppedThumbnail,
             x: centerX - width / 2 + offsetX,
             y: centerY - height / 2 + offsetY,
             width,
             height,
             rotation: 0,
             name: `${file.name} Thumbnail`,
             visible: true,
             isGlbThumbnail: true,
             glbUrl: glbUrl,
           }

           newLayers.push(newLayer)
         } catch (error) {
           console.error('Failed to generate GLB thumbnail:', error)
           // Use dummy box thumbnail as fallback
           try {
             const dummyThumbnail = await generateDummyBoxThumbnail()
             const croppedDummyThumbnail = await cropTransparent(dummyThumbnail)

             // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
             const aspectRatio = croppedDummyThumbnail.width / croppedDummyThumbnail.height

             let width: number, height: number
             if (maxDimensionEnabled) {
               if (croppedDummyThumbnail.width > croppedDummyThumbnail.height) {
                 // Landscape thumbnail
                 width = Math.min(croppedDummyThumbnail.width, maxDimension)
                 height = width / aspectRatio
               } else {
                 // Portrait or square thumbnail
                 height = Math.min(croppedDummyThumbnail.height, maxDimension)
                 width = height * aspectRatio
               }
             } else {
               // Use original dimensions
               width = croppedDummyThumbnail.width
               height = croppedDummyThumbnail.height
             }

             // Ensure they are divisible by 4
             width = Math.ceil(width / 4) * 4
             height = Math.ceil(height / 4) * 4

             // Arrange thumbnails in a grid pattern around the center
             const cols = Math.ceil(Math.sqrt(glbFiles.length))
             const rows = Math.ceil(glbFiles.length / cols)
             const colIndex = i % cols
             const rowIndex = Math.floor(i / cols)

             const spacing = 320 // Space between thumbnails
             const offsetX = (colIndex - (cols - 1) / 2) * spacing
             const offsetY = (rowIndex - (rows - 1) / 2) * spacing

             const newLayer: Layer = {
               id: `layer-glb-thumb-${Date.now()}-${i}`,
               type: 'image',
               image: croppedDummyThumbnail,
               x: centerX - width / 2 + offsetX,
               y: centerY - height / 2 + offsetY,
               width,
               height,
               rotation: 0,
               name: `${file.name} Thumbnail`,
               visible: true,
               isGlbThumbnail: true,
               glbUrl: glbUrl,
             }

             newLayers.push(newLayer)
           } catch (dummyError) {
             console.error('Failed to generate dummy thumbnail:', dummyError)
           }
         }
       }

       if (newLayers.length > 0) {
         const updatedLayers = [...layers, ...newLayers]
         setLayers(updatedLayers)
         setSelectedLayerIds([newLayers[newLayers.length - 1].id])
         saveToHistory(updatedLayers, [newLayers[newLayers.length - 1].id])
       }
     }

     // Handle image files
     if (imageFiles.length > 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      // Calculate center position of the visible canvas area
      const rect = canvas.getBoundingClientRect()
      const centerX = (rect.width / 2 - pan.x) / zoom
      const centerY = (rect.height / 2 - pan.y) / zoom

      const newLayers: Layer[] = []
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const img = await loadImage(file)

        // Crop transparent parts
        const croppedImg = await cropTransparent(img)

        // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
        const aspectRatio = croppedImg.width / croppedImg.height

        let width: number, height: number
        if (maxDimensionEnabled) {
          if (croppedImg.width > croppedImg.height) {
            // Landscape image
            width = Math.min(croppedImg.width, maxDimension)
            height = width / aspectRatio
          } else {
            // Portrait or square image
            height = Math.min(croppedImg.height, maxDimension)
            width = height * aspectRatio
          }
        } else {
          // Use original dimensions
          width = croppedImg.width
          height = croppedImg.height
        }

        // Use original dimensions and ensure they are divisible by 4
        width = Math.ceil(width / 4) * 4
        height = Math.ceil(height / 4) * 4

        // Arrange images in a grid pattern around the center
        const cols = Math.ceil(Math.sqrt(imageFiles.length))
        const rows = Math.ceil(imageFiles.length / cols)
        const colIndex = i % cols
        const rowIndex = Math.floor(i / cols)

        const spacing = 320 // Space between images
        const offsetX = (colIndex - (cols - 1) / 2) * spacing
        const offsetY = (rowIndex - (rows - 1) / 2) * spacing

        const newLayer: Layer = {
          id: `layer-${Date.now()}-${i}`,
          type: 'image',
          image: croppedImg,
          x: centerX - width / 2 + offsetX,
          y: centerY - height / 2 + offsetY,
          width,
          height,
          rotation: 0,
          name: file.name,
          visible: true,
        }

        newLayers.push(newLayer)
      }

      const updatedLayers = [...layers, ...newLayers]
      setLayers(updatedLayers)
      setSelectedLayerIds([newLayers[newLayers.length - 1].id])
      saveToHistory(updatedLayers, [newLayers[newLayers.length - 1].id])
    }

    // Reset the input value so the same files can be selected again
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const allFiles = Array.from(e.dataTransfer.files)
    const imageFiles = allFiles.filter((file) => file.type.startsWith("image/"))
    const videoFiles = allFiles.filter((file) => file.type.startsWith("video/"))
    const glbFiles = allFiles.filter((file) => file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf'))

    // Handle video files
    if (videoFiles.length > 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const dropX = (e.clientX - rect.left - pan.x) / zoom
      const dropY = (e.clientY - rect.top - pan.y) / zoom

      const newLayers: Layer[] = []
      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i]
        const video = document.createElement('video')
        video.preload = 'auto'
        video.src = URL.createObjectURL(file)
        video.muted = true // Required for autoplay in some browsers

        // Handle duration updates when metadata loads
        const handleMetadataLoaded = () => {
          // Update duration in existing layer if it exists
          setLayers(currentLayers => {
            return currentLayers.map(layer => {
              if (layer.type === 'video' && layer.video === video && (!layer.duration || layer.duration !== video.duration)) {
                return { ...layer, duration: video.duration }
              }
              return layer
            })
          })
        }

        // Handle time updates during playback
        const handleTimeUpdate = () => {
          setLayers(currentLayers => {
            return currentLayers.map(layerItem => {
              if (layerItem.type === 'video' && layerItem.video === video) {
                return { ...layerItem, currentTime: video.currentTime }
              }
              return layerItem
            })
          })
        }

        video.addEventListener('loadedmetadata', handleMetadataLoaded)
        video.addEventListener('durationchange', handleMetadataLoaded)
        video.addEventListener('timeupdate', handleTimeUpdate)

        await new Promise<void>((resolve) => {
          video.onloadeddata = () => {
            // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
            const aspectRatio = video.videoWidth / video.videoHeight

            let width: number, height: number
            if (maxDimensionEnabled) {
              if (video.videoWidth > video.videoHeight) {
                // Landscape video
                width = Math.min(video.videoWidth, maxDimension)
                height = width / aspectRatio
              } else {
                // Portrait or square video
                height = Math.min(video.videoHeight, maxDimension)
                width = height * aspectRatio
              }
            } else {
              // Use original dimensions
              width = video.videoWidth
              height = video.videoHeight
            }

            // Ensure they are divisible by 4
            width = Math.ceil(width / 4) * 4
            height = Math.ceil(height / 4) * 4

            const newLayer: Layer = {
              id: `layer-video-${Date.now()}-${i}`,
              type: 'video',
              video: video,
              videoUrl: URL.createObjectURL(file),
              currentTime: 0,
              duration: video.duration || 0, // Use 0 as fallback if duration not available yet
              isPlaying: false,
              x: dropX - width / 2 + i * 20,
              y: dropY - height / 2 + i * 20,
              width,
              height,
              rotation: 0,
              name: file.name,
              visible: true,
            }

            newLayers.push(newLayer)
            resolve()
          }
        })
      }

      const updatedLayers = [...layers, ...newLayers]
      setLayers(updatedLayers)
      setSelectedLayerIds([newLayers[newLayers.length - 1].id])
      saveToHistory(updatedLayers, [newLayers[newLayers.length - 1].id])
    }

    // Handle GLB files
    if (glbFiles.length > 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      // Calculate center position of the visible canvas area
      const rect = canvas.getBoundingClientRect()
      const centerX = (rect.width / 2 - pan.x) / zoom
      const centerY = (rect.height / 2 - pan.y) / zoom

      const newLayers: Layer[] = []
      for (let i = 0; i < glbFiles.length; i++) {
        const file = glbFiles[i]
        const glbUrl = URL.createObjectURL(file)

        try {
          const thumbnail = await generateGLBThumbnail(glbUrl)
          const croppedThumbnail = await cropTransparent(thumbnail)

          // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
          const aspectRatio = croppedThumbnail.width / croppedThumbnail.height

          let width: number, height: number
          if (maxDimensionEnabled) {
            if (croppedThumbnail.width > croppedThumbnail.height) {
              // Landscape thumbnail
              width = Math.min(croppedThumbnail.width, maxDimension)
              height = width / aspectRatio
            } else {
              // Portrait or square thumbnail
              height = Math.min(croppedThumbnail.height, maxDimension)
              width = height * aspectRatio
            }
          } else {
            // Use original dimensions
            width = croppedThumbnail.width
            height = croppedThumbnail.height
          }

          // Ensure they are divisible by 4
          width = Math.ceil(width / 4) * 4
          height = Math.ceil(height / 4) * 4

          // Arrange thumbnails in a grid pattern around the center
          const cols = Math.ceil(Math.sqrt(glbFiles.length))
          const rows = Math.ceil(glbFiles.length / cols)
          const colIndex = i % cols
          const rowIndex = Math.floor(i / cols)

          const spacing = 320 // Space between thumbnails
          const offsetX = (colIndex - (cols - 1) / 2) * spacing
          const offsetY = (rowIndex - (rows - 1) / 2) * spacing

          const newLayer: Layer = {
            id: `layer-glb-thumb-${Date.now()}-${i}`,
            type: 'image',
            image: croppedThumbnail,
            x: centerX - width / 2 + offsetX,
            y: centerY - height / 2 + offsetY,
            width,
            height,
            rotation: 0,
            name: `${file.name} Thumbnail`,
            visible: true,
            isGlbThumbnail: true,
            glbUrl: glbUrl,
          }

          newLayers.push(newLayer)
        } catch (error) {
          console.error('Failed to generate GLB thumbnail:', error)
          // Use dummy box thumbnail as fallback
          try {
            const dummyThumbnail = await generateDummyBoxThumbnail()
            const croppedDummyThumbnail = await cropTransparent(dummyThumbnail)

            // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
            const aspectRatio = croppedDummyThumbnail.width / croppedDummyThumbnail.height

            let width: number, height: number
            if (maxDimensionEnabled) {
              if (croppedDummyThumbnail.width > croppedDummyThumbnail.height) {
                // Landscape thumbnail
                width = Math.min(croppedDummyThumbnail.width, maxDimension)
                height = width / aspectRatio
              } else {
                // Portrait or square thumbnail
                height = Math.min(croppedDummyThumbnail.height, maxDimension)
                width = height * aspectRatio
              }
            } else {
              // Use original dimensions
              width = croppedDummyThumbnail.width
              height = croppedDummyThumbnail.height
            }

            // Ensure they are divisible by 4
            width = Math.ceil(width / 4) * 4
            height = Math.ceil(height / 4) * 4

            // Arrange thumbnails in a grid pattern around the center
            const cols = Math.ceil(Math.sqrt(glbFiles.length))
            const rows = Math.ceil(glbFiles.length / cols)
            const colIndex = i % cols
            const rowIndex = Math.floor(i / cols)

            const spacing = 320 // Space between thumbnails
            const offsetX = (colIndex - (cols - 1) / 2) * spacing
            const offsetY = (rowIndex - (rows - 1) / 2) * spacing

            const newLayer: Layer = {
              id: `layer-glb-thumb-${Date.now()}-${i}`,
              type: 'image',
              image: croppedDummyThumbnail,
              x: centerX - width / 2 + offsetX,
              y: centerY - height / 2 + offsetY,
              width,
              height,
              rotation: 0,
              name: `${file.name} Thumbnail`,
              visible: true,
              isGlbThumbnail: true,
              glbUrl: glbUrl,
            }

            newLayers.push(newLayer)
          } catch (dummyError) {
            console.error('Failed to generate dummy thumbnail:', dummyError)
          }
        }
      }

      if (newLayers.length > 0) {
        const updatedLayers = [...layers, ...newLayers]
        setLayers(updatedLayers)
        setSelectedLayerIds([newLayers[newLayers.length - 1].id])
        saveToHistory(updatedLayers, [newLayers[newLayers.length - 1].id])
      }
    }


    // Handle image files
    if (imageFiles.length > 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const dropX = (e.clientX - rect.left - pan.x) / zoom
      const dropY = (e.clientY - rect.top - pan.y) / zoom

      const newLayers: Layer[] = []
      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i]
        const img = await loadImage(file)

        // Crop transparent parts
        const croppedImg = await cropTransparent(img)

        // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
        const aspectRatio = croppedImg.width / croppedImg.height

        let width: number, height: number
        if (maxDimensionEnabled) {
          if (croppedImg.width > croppedImg.height) {
            // Landscape image
            width = Math.min(croppedImg.width, maxDimension)
            height = width / aspectRatio
          } else {
            // Portrait or square image
            height = Math.min(croppedImg.height, maxDimension)
            width = height * aspectRatio
          }
        } else {
          // Use original dimensions
          width = croppedImg.width
          height = croppedImg.height
        }

        // Use original dimensions and ensure they are divisible by 4
        width = Math.ceil(width / 4) * 4
        height = Math.ceil(height / 4) * 4

        const newLayer: Layer = {
          id: `layer-${Date.now()}-${i}`,
          type: 'image',
          image: croppedImg,
          x: dropX - width / 2 + i * 20,
          y: dropY - height / 2 + i * 20,
          width,
          height,
          rotation: 0,
          name: file.name,
          visible: true,
        }

        newLayers.push(newLayer)
      }

      const updatedLayers = [...layers, ...newLayers]
      setLayers(updatedLayers)
      setSelectedLayerIds([newLayers[newLayers.length - 1].id])
      saveToHistory(updatedLayers, [newLayers[newLayers.length - 1].id])

      // Show timeline panel when video layers are added
      if (videoFiles.length > 0) {
        setShowTimelinePanel(true)
      }
    }
  }

  const screenToCanvas = (screenX: number, screenY: number) => {
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    }
  }

  const getTouchCenter = (touches: React.TouchList) => {
    if (touches.length === 0) return { x: 0, y: 0 }
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < touches.length; i++) {
      sumX += touches[i].clientX
      sumY += touches[i].clientY
    }
    return { x: sumX / touches.length, y: sumY / touches.length }
  }

  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX
    const dy = touch1.clientY - touch2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getHandleAtPosition = (x: number, y: number, layer: Layer): Handle => {
    const handleSize = 8 / zoom
    const rotateHandleDistance = 30

    const centerX = layer.x + layer.width / 2
    const centerY = layer.y + layer.height / 2
    const angle = (-layer.rotation * Math.PI) / 180
    const dx = x - centerX
    const dy = y - centerY
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

    if (Math.abs(localX) < handleSize && Math.abs(localY - (-layer.height / 2 - rotateHandleDistance)) < handleSize) {
      return "rotate"
    }

    const corners: { handle: Handle; x: number; y: number }[] = [
      { handle: "nw", x: -layer.width / 2, y: -layer.height / 2 },
      { handle: "ne", x: layer.width / 2, y: -layer.height / 2 },
      { handle: "sw", x: -layer.width / 2, y: layer.height / 2 },
      { handle: "se", x: layer.width / 2, y: layer.height / 2 },
    ]

    for (const corner of corners) {
      if (Math.abs(localX - corner.x) < handleSize && Math.abs(localY - corner.y) < handleSize) {
        return corner.handle
      }
    }

    const edges: { handle: Handle; x: number; y: number }[] = [
      { handle: "n", x: 0, y: -layer.height / 2 },
      { handle: "e", x: layer.width / 2, y: 0 },
      { handle: "s", x: 0, y: layer.height / 2 },
      { handle: "w", x: -layer.width / 2, y: 0 },
    ]

    for (const edge of edges) {
      if (Math.abs(localX - edge.x) < handleSize && Math.abs(localY - edge.y) < handleSize) {
        return edge.handle
      }
    }

    return null
  }

  const isPointInLayer = (x: number, y: number, layer: Layer): boolean => {
    const centerX = layer.x + layer.width / 2
    const centerY = layer.y + layer.height / 2
    const angle = (-layer.rotation * Math.PI) / 180
    const dx = x - centerX
    const dy = y - centerY
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

    return Math.abs(localX) <= layer.width / 2 && Math.abs(localY) <= layer.height / 2
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const { x, y } = screenToCanvas(screenX, screenY)

    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      return
    }

    if (primarySelectedLayer) {
      const handle = getHandleAtPosition(x, y, primarySelectedLayer)
      if (handle) {
        if (e.altKey && !handle) {
          const duplicatedLayer: Layer = {
            ...primarySelectedLayer,
            id: `layer-${Date.now()}`,
            name: `${primarySelectedLayer.name} (copy)`,
          }
          const newLayers = [...layers, duplicatedLayer]
          setLayers(newLayers)
          setSelectedLayerIds([duplicatedLayer.id])
          setInitialDragPositions({ [duplicatedLayer.id]: { x: duplicatedLayer.x, y: duplicatedLayer.y } })
          setIsDragging(true)
          setDragStart({ x, y })
          setIsDuplicating(true)
          return
        }

        if (handle === "rotate") {
          setIsRotating(true)
        } else {
          setIsResizing(true)
        }
        setActiveHandle(handle)
        setDragStart({ x, y })
        setInitialLayerState({ ...primarySelectedLayer })
        return
      }
    }

    for (const layer of selectedLayers) {
      if (isPointInLayer(x, y, layer)) {
        if (e.altKey) {
          const duplicatedLayers = selectedLayers.map((l) => ({
            ...l,
            id: `layer-${Date.now()}-${Math.random()}`,
            name: `${l.name} (copy)`,
          }))
          const newLayers = [...layers, ...duplicatedLayers]
          setLayers(newLayers)
          setSelectedLayerIds(duplicatedLayers.map((l) => l.id))
          setInitialDragPositions(Object.fromEntries(duplicatedLayers.map(l => [l.id, {x: l.x, y: l.y}])))
          setIsDragging(true)
          setDragStart({ x, y })
          setIsDuplicating(true)
          saveToHistory(
            newLayers,
            duplicatedLayers.map((l) => l.id),
          )
          return
        }

        // Already selected, start dragging all selected layers
        setInitialDragPositions(Object.fromEntries(selectedLayers.map(l => [l.id, {x: l.x, y: l.y}])))
        setIsDragging(true)
        setDragStart({ x, y })
        return
      }
    }

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      if (layer.visible && isPointInLayer(x, y, layer)) {
        if (e.altKey) {
          const duplicatedLayer: Layer = {
            ...layer,
            id: `layer-${Date.now()}`,
            name: `${layer.name} (copy)`,
          }
          const newLayers = [...layers, duplicatedLayer]
          setLayers(newLayers)
          setSelectedLayerIds([duplicatedLayer.id])
          setInitialDragPositions({ [duplicatedLayer.id]: { x: duplicatedLayer.x, y: duplicatedLayer.y } })
          setIsDragging(true)
          setDragStart({ x, y })
          setIsDuplicating(true)
          saveToHistory(newLayers, [duplicatedLayer.id])
          return
        }

        if (e.ctrlKey || e.metaKey) {
          if (selectedLayerIds.includes(layer.id)) {
            // Deselect if already selected
            setSelectedLayerIds(selectedLayerIds.filter((id) => id !== layer.id))
          } else {
            // Add to selection
            setSelectedLayerIds([...selectedLayerIds, layer.id])
          }
        } else {
          // Single select
          setSelectedLayerIds([layer.id])
          setInitialDragPositions({ [layer.id]: { x: layer.x, y: layer.y } })
          setIsDragging(true)
          setDragStart({ x, y })
        }
        // Show timeline if video layer is clicked
        if (layer.type === 'video') {
          setShowTimelinePanel(true)
        }
        return
      }
    }

    setSelectedLayerIds([])
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const { x, y } = screenToCanvas(screenX, screenY)

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
      return
    }

    if (primarySelectedLayer && primarySelectedLayer.visible && !isDragging && !isResizing && !isRotating) {
      const handle = getHandleAtPosition(x, y, primarySelectedLayer)
      if (handle === "rotate") {
        canvas.style.cursor = "grab"
      } else if (handle) {
        // Set appropriate cursor based on handle type
        if (handle === "e" || handle === "w") {
          canvas.style.cursor = "ew-resize"
        } else if (handle === "n" || handle === "s") {
          canvas.style.cursor = "ns-resize"
        } else if (handle === "nw" || handle === "se") {
          canvas.style.cursor = "nwse-resize"
        } else if (handle === "ne" || handle === "sw") {
          canvas.style.cursor = "nesw-resize"
        }
      } else if (isPointInLayer(x, y, primarySelectedLayer)) {
        canvas.style.cursor = e.altKey ? "copy" : "move"
      } else {
        canvas.style.cursor = "default"
      }
    } else {
      canvas.style.cursor = "default"
    }

    if (isDragging && selectedLayerIds.length > 0 && initialDragPositions) {
      const deltaX = x - dragStart.x
      const deltaY = y - dragStart.y

      setLayers((prev) =>
        prev.map((layer) => {
          if (selectedLayerIds.includes(layer.id)) {
            const initial = initialDragPositions[layer.id]
            if (initial) {
              return { ...layer, x: initial.x + deltaX, y: initial.y + deltaY }
            }
          }
          return layer
        }),
      )
    } else if (isResizing && selectedLayerIds.length === 1 && initialLayerState && activeHandle) {
      const layer = initialLayerState

      if (layer.type === 'text') {
        // For text layers, resize by changing font size instead of dimensions
        const centerX = layer.x + layer.width / 2
        const centerY = layer.y + layer.height / 2
        const angle = (-layer.rotation * Math.PI) / 180
        const dx = x - centerX
        const dy = y - centerY
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

        // Calculate scale factor based on the resize handle
        let scaleFactor = 1
        if (activeHandle.includes("e")) {
          scaleFactor = Math.max(0.1, (localX + layer.width / 2) / layer.width)
        } else if (activeHandle.includes("w")) {
          scaleFactor = Math.max(0.1, (layer.width / 2 - localX) / layer.width)
        } else if (activeHandle.includes("s")) {
          scaleFactor = Math.max(0.1, (localY + layer.height / 2) / layer.height)
        } else if (activeHandle.includes("n")) {
          scaleFactor = Math.max(0.1, (layer.height / 2 - localY) / layer.height)
        }

        const newFontSize = Math.max(8, Math.min(200, (layer.fontSize || 24) * scaleFactor))

        setLayers((prev) =>
          prev.map((l) => {
            if (l.id === selectedLayerIds[0]) {
              const updatedLayer = { ...l, fontSize: newFontSize }
              return updateTextLayerDimensions(updatedLayer)
            }
            return l
          }),
        )
      } else {
        // Original resizing logic for image layers
        const centerX = layer.x + layer.width / 2
        const centerY = layer.y + layer.height / 2
        const angle = (-layer.rotation * Math.PI) / 180
        const dx = x - centerX
        const dy = y - centerY
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

        let newWidth = layer.width
        let newHeight = layer.height
        let newX = layer.x
        let newY = layer.y

        if (activeHandle.includes("e")) {
          newWidth = Math.max(20, localX + layer.width / 2)
        } else if (activeHandle.includes("w")) {
          newWidth = Math.max(20, layer.width / 2 - localX)
        }

        if (activeHandle.includes("s")) {
          newHeight = Math.max(20, localY + layer.height / 2)
        } else if (activeHandle.includes("n")) {
          newHeight = Math.max(20, layer.height / 2 - localY)
        }

        // For corner handles, maintain aspect ratio
        if (activeHandle.length === 2) {
          const aspectRatio = layer.width / layer.height
          // Always adjust height based on width to maintain aspect ratio
          newHeight = newWidth / aspectRatio
        }

        newX = centerX - newWidth / 2
        newY = centerY - newHeight / 2

        setLayers((prev) =>
          prev.map((l) =>
            l.id === selectedLayerIds[0] ? { ...l, width: newWidth, height: newHeight, x: newX, y: newY } : l,
          ),
        )
      }
    } else if (isRotating && selectedLayerIds.length === 1 && initialLayerState) {
      const layer = initialLayerState
      const centerX = layer.x + layer.width / 2
      const centerY = layer.y + layer.height / 2
      const angle = Math.atan2(y - centerY, x - centerX)
      const rotation = ((angle * 180) / Math.PI + 90) % 360

      setLayers((prev) => prev.map((l) => (l.id === selectedLayerIds[0] ? { ...l, rotation } : l)))
    }
  }

  const handleCanvasMouseUp = () => {
    if (isDragging || isResizing || isRotating) {
      saveToHistory(layers, selectedLayerIds)
    }
    setIsDragging(false)
    setIsResizing(false)
    setIsRotating(false)
    setActiveHandle(null)
    setInitialLayerState(null)
    setInitialDragPositions(null)
    setIsPanning(false)
    setIsDuplicating(false)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const touches = e.touches

    if (touches.length === 1) {
      // Single touch - handle like mouse down
      const touch = touches[0]
      const screenX = touch.clientX - rect.left
      const screenY = touch.clientY - rect.top
      const { x, y } = screenToCanvas(screenX, screenY)

      setTouchStart({ x: screenX, y: screenY })

      // Handle layer selection and dragging similar to mouse
      if (primarySelectedLayer) {
        const handle = getHandleAtPosition(x, y, primarySelectedLayer)
        if (handle) {
          if (handle === "rotate") {
            setIsRotating(true)
          } else {
            setIsResizing(true)
          }
          setActiveHandle(handle)
          setDragStart({ x, y })
          setInitialLayerState({ ...primarySelectedLayer })
          return
        }
      }

      // Check for layer selection
      for (const layer of selectedLayers) {
        if (isPointInLayer(x, y, layer)) {
          setInitialDragPositions(Object.fromEntries(selectedLayers.map(l => [l.id, {x: l.x, y: l.y}])))
          setIsDragging(true)
          setDragStart({ x, y })
          return
        }
      }

      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i]
        if (layer.visible && isPointInLayer(x, y, layer)) {
          setSelectedLayerIds([layer.id])
          setInitialDragPositions({ [layer.id]: { x: layer.x, y: layer.y } })
          setIsDragging(true)
          setDragStart({ x, y })
          return
        }
      }

      setSelectedLayerIds([])
    } else if (touches.length === 2) {
      // Two touches - prepare for pinch zoom
      const touch1 = touches[0]
      const touch2 = touches[1]
      const distance = getTouchDistance(touch1, touch2)
      setLastTouchDistance(distance)
      setInitialZoom(zoom)
      setIsPanning(false)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const touches = e.touches

    if (touches.length === 1 && touchStart) {
      // Single touch - handle dragging/panning
      const touch = touches[0]
      const screenX = touch.clientX - rect.left
      const screenY = touch.clientY - rect.top
      const { x, y } = screenToCanvas(screenX, screenY)

      if (isDragging && selectedLayerIds.length > 0 && initialDragPositions) {
        const deltaX = x - dragStart.x
        const deltaY = y - dragStart.y

        setDragDelta({ x: deltaX * zoom, y: deltaY * zoom })
      } else if (isResizing && selectedLayerIds.length === 1 && initialLayerState && activeHandle) {
        const layer = initialLayerState

        if (layer.type === 'text') {
          // For text layers, resize by changing font size instead of dimensions
          const centerX = layer.x + layer.width / 2
          const centerY = layer.y + layer.height / 2
          const angle = (-layer.rotation * Math.PI) / 180
          const dx = x - centerX
          const dy = y - centerY
          const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
          const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

          // Calculate scale factor based on the resize handle
          let scaleFactor = 1
          if (activeHandle.includes("e")) {
            scaleFactor = Math.max(0.1, (localX + layer.width / 2) / layer.width)
          } else if (activeHandle.includes("w")) {
            scaleFactor = Math.max(0.1, (layer.width / 2 - localX) / layer.width)
          } else if (activeHandle.includes("s")) {
            scaleFactor = Math.max(0.1, (localY + layer.height / 2) / layer.height)
          } else if (activeHandle.includes("n")) {
            scaleFactor = Math.max(0.1, (layer.height / 2 - localY) / layer.height)
          }

          const newFontSize = Math.max(8, Math.min(200, (layer.fontSize || 24) * scaleFactor))

          setLayers((prev) =>
            prev.map((l) => {
              if (l.id === selectedLayerIds[0]) {
                const updatedLayer = { ...l, fontSize: newFontSize }
                return updateTextLayerDimensions(updatedLayer)
              }
              return l
            }),
          )
        } else {
          // Original resizing logic for image layers
          const centerX = layer.x + layer.width / 2
          const centerY = layer.y + layer.height / 2
          const angle = (-layer.rotation * Math.PI) / 180
          const dx = x - centerX
          const dy = y - centerY
          const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
          const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

          let newWidth = layer.width
          let newHeight = layer.height
          let newX = layer.x
          let newY = layer.y

          if (activeHandle.includes("e")) {
            newWidth = Math.max(20, localX + layer.width / 2)
          } else if (activeHandle.includes("w")) {
            newWidth = Math.max(20, layer.width / 2 - localX)
          }

          if (activeHandle.includes("s")) {
            newHeight = Math.max(20, localY + layer.height / 2)
          } else if (activeHandle.includes("n")) {
            newHeight = Math.max(20, layer.height / 2 - localY)
          }

          if (activeHandle.length === 2) {
            const aspectRatio = layer.width / layer.height
            newHeight = newWidth / aspectRatio
          }

          newX = centerX - newWidth / 2
          newY = centerY - newHeight / 2

          setLayers((prev) =>
            prev.map((l) =>
              l.id === selectedLayerIds[0] ? { ...l, width: newWidth, height: newHeight, x: newX, y: newY } : l,
            )
          )
        }
      } else if (isRotating && selectedLayerIds.length === 1 && initialLayerState) {
        const layer = initialLayerState
        const centerX = layer.x + layer.width / 2
        const centerY = layer.y + layer.height / 2
        const angle = Math.atan2(y - centerY, x - centerX)
        const rotation = ((angle * 180) / Math.PI + 90) % 360

        setLayers((prev) => prev.map((l) => (l.id === selectedLayerIds[0] ? { ...l, rotation } : l)))
      } else {
        // Pan with single touch if not interacting with layers
        const deltaX = screenX - touchStart.x
        const deltaY = screenY - touchStart.y
        setPan({
          x: pan.x + deltaX,
          y: pan.y + deltaY,
        })
        setTouchStart({ x: screenX, y: screenY })
      }
    } else if (touches.length === 2 && lastTouchDistance !== null) {
      // Two touches - handle pinch zoom
      const touch1 = touches[0]
      const touch2 = touches[1]
      const distance = getTouchDistance(touch1, touch2)
      const scale = distance / lastTouchDistance
      const newZoom = Math.max(0.1, Math.min(5, initialZoom * scale))

      // Zoom towards the center of the two touches
      const center = getTouchCenter(touches)
      const rect = canvas.getBoundingClientRect()
      const mouseX = center.x - rect.left
      const mouseY = center.y - rect.top

      const zoomPoint = {
        x: (mouseX - pan.x) / zoom,
        y: (mouseY - pan.y) / zoom,
      }

      setPan({
        x: mouseX - zoomPoint.x * newZoom,
        y: mouseY - zoomPoint.y * newZoom,
      })

      setZoom(newZoom)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()

    if (isDragging || isResizing || isRotating) {
      saveToHistory(layers, selectedLayerIds)
    }

    if (isDragging) {
      setLayers(prev => prev.map(layer => {
        if (selectedLayerIds.includes(layer.id)) {
          return { ...layer, x: layer.x + (dragDelta.x / zoom), y: layer.y + (dragDelta.y / zoom) }
        }
        return layer
      }))
      setDragDelta({ x: 0, y: 0 })
    }
    setIsDragging(false)
    setIsResizing(false)
    setIsRotating(false)
    setActiveHandle(null)
    setInitialLayerState(null)
    setInitialDragPositions(null)
    setTouchStart(null)
    setLastTouchDistance(null)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta))

    // Zoom towards mouse position
    const zoomPoint = {
      x: (mouseX - pan.x) / zoom,
      y: (mouseY - pan.y) / zoom,
    }

    setPan({
      x: mouseX - zoomPoint.x * newZoom,
      y: mouseY - zoomPoint.y * newZoom,
    })

    setZoom(newZoom)
  }

  const deleteSelectedLayer = () => {
    if (selectedLayerIds.length === 0) return
    const newLayers = layers.filter((layer) => !selectedLayerIds.includes(layer.id))
    setLayers(newLayers)
    setSelectedLayerIds([])
    // Hide timeline when clicking on empty canvas space
    setShowTimelinePanel(false)
    saveToHistory(newLayers, [])
  }
  
  const exportLayer = (layerId: string) => {
      const layer = layers.find(l => l.id === layerId)
      if (!layer) return

      if (layer.type === 'video' && layer.videoUrl) {
        // For video layers, download the video file directly
        const a = document.createElement("a")
        a.href = layer.videoUrl!
        a.download = `${layer.name.replace(/\s+/g, '_')}-TostAI-${Date.now()}.mp4`
        a.click()
        return
      }

      if (layer.type === 'glb' && layer.glbUrl) {
        // For GLB layers, download the GLB file directly
        const a = document.createElement("a")
        a.href = layer.glbUrl!
        a.download = `${layer.name.replace(/\s+/g, '_')}-TostAI-${Date.now()}.glb`
        a.click()
        return
      }

     const canvas = document.createElement("canvas")
     canvas.width = layer.width
     canvas.height = layer.height
     const ctx = canvas.getContext("2d")
     if (!ctx) return

     if (layer.type === 'image' && layer.image) {
       ctx.drawImage(layer.image, 0, 0, layer.width, layer.height)
     } else if (layer.type === 'text' && layer.text) {
       ctx.font = `${layer.fontSize || 24}px ${layer.fontFamily || 'Arial'}`
       ctx.fillStyle = layer.color || '#000000'
       ctx.fillText(layer.text, 0, layer.fontSize || 24)
     }

     canvas.toBlob((blob) => {
       if (!blob) return
       const url = URL.createObjectURL(blob)
       const a = document.createElement("a")
       a.href = url
       a.download = `${layer.name.replace(/\s+/g, '_')}-TostAI-${Date.now()}.png`
       a.click()
       URL.revokeObjectURL(url)
     })
   }

  // Load background removal models asynchronously
  const loadBgRemovalModels = async () => {
    if (bgRemovalModels) return bgRemovalModels

    try {
      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained("briaai/RMBG-1.4"),
        AutoProcessor.from_pretrained("briaai/RMBG-1.4")
      ])

      const models = { model, processor }
      setBgRemovalModels(models)
      return models
    } catch (error) {
      console.error('Failed to load background removal models:', error)
      throw error
    }
  }

  // Process background removal queue sequentially
  const processBgRemovalQueue = async (models: {model: any, processor: any}, queue: string[]) => {
    for (const layerId of queue) {
      const layer = layers.find(l => l.id === layerId)

      if (!layer || layer.type !== 'image' || !layer.image) {
        // Skip invalid layer
        continue
      }

      setCurrentProcessingLayer(layer.name)

      try {
        // Convert layer image to RawImage
        const canvas = document.createElement("canvas")
        canvas.width = layer.image!.width
        canvas.height = layer.image!.height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          setCurrentProcessingLayer(null)
          continue
        }
        ctx.drawImage(layer.image!, 0, 0)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const image = new RawImage(imageData.data, canvas.width, canvas.height, 4)

        // Preprocess image
        const { pixel_values } = await models.processor(image)

        // Predict alpha matte
        const { output } = await models.model({ input: pixel_values })

        // Resize mask back to original size
        const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
          image.width,
          image.height,
        )

        // Apply alpha to original image
        image.putAlpha(mask)

        // Convert back to HTMLImageElement
        const newCanvas = document.createElement("canvas")
        newCanvas.width = image.width
        newCanvas.height = image.height
        const newCtx = newCanvas.getContext("2d")
        if (!newCtx) {
          setCurrentProcessingLayer(null)
          continue
        }

        // Put the processed image data
        const processedImageData = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
        newCtx.putImageData(processedImageData, 0, 0)

        // Wait for image to load
        await new Promise<void>((resolve) => {
          const newImg = new window.Image()
          newImg.onload = () => {
            // Create new layer with background removed
            const newLayer: Layer = {
              id: `layer-bg-removed-${Date.now()}-${Math.random()}`,
              type: 'image',
              image: newImg,
              x: layer.x + 20, // Offset slightly from original
              y: layer.y + 20,
              width: layer.width,
              height: layer.height,
              rotation: layer.rotation,
              name: `${layer.name} (BG Removed)`,
              visible: true,
            }

            setLayers(prev => [...prev, newLayer])
            setForceRedraw(prev => prev + 1)

            // Show timeline panel for video layers
            setShowTimelinePanel(true)
            resolve()
          }
          newImg.src = newCanvas.toDataURL()
        })

      } catch (error) {
        console.error(`Background removal failed for layer ${layer.name}:`, error)
      }

      setCurrentProcessingLayer(null)
    }

    // Processing complete
    setIsBgRemovalProcessing(false)
    setCurrentProcessingLayer(null)
    setBgRemovalQueue([])
  }

  const removeBackground = async (layerIds: string[]) => {
    // Filter to only image layers that aren't already in queue
    const imageLayerIds = layerIds.filter(id => {
      const layer = layers.find(l => l.id === id)
      return layer && layer.type === 'image' && layer.image && !bgRemovalQueue.includes(id)
    })

    if (imageLayerIds.length === 0) return

    // Add to queue
    const newQueue = [...bgRemovalQueue, ...imageLayerIds]
    setBgRemovalQueue(newQueue)

    // Start processing if not already processing
    if (!isBgRemovalProcessing) {
      setIsBgRemovalProcessing(true)

      loadBgRemovalModels().then(models => {
        processBgRemovalQueue(models, newQueue)
      }).catch(error => {
        console.error('Failed to load models for background removal:', error)
        setIsBgRemovalProcessing(false)
        setBgRemovalQueue([])
        alert('Failed to load background removal models. Please try again.')
      })
    }
  }

  const copyLayerToClipboard = async (layerId: string) => {
     const layer = layers.find(l => l.id === layerId)
     if (!layer) return

     try {
       const canvas = document.createElement("canvas")
       canvas.width = layer.width
       canvas.height = layer.height
       const ctx = canvas.getContext("2d")
       if (!ctx) return

       if (layer.type === 'image' && layer.image) {
         ctx.drawImage(layer.image, 0, 0, layer.width, layer.height)
       } else if (layer.type === 'text' && layer.text) {
         ctx.font = `${layer.fontSize || 24}px ${layer.fontFamily || 'Arial'}`
         ctx.fillStyle = layer.color || '#000000'
         ctx.fillText(layer.text, 0, layer.fontSize || 24)
       } else if (layer.type === 'video' && layer.video) {
         // For video layers, copy the current frame as an image
         ctx.drawImage(layer.video, 0, 0, layer.width, layer.height)
       } else if (layer.type === 'glb') {
         // GLB layers cannot be copied to clipboard as images
         return
       }

       const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
       if (!blob) return

       await navigator.clipboard.write([
         new ClipboardItem({ 'image/png': blob })
       ])

     } catch (error) {
       console.error('Failed to copy layer to clipboard:', error)
     }
   }

  const updateTextLayerDimensions = (layer: Layer) => {
    if (layer.type !== 'text' || !layer.text) return layer

    const tempCanvas = document.createElement("canvas")
    const tempCtx = tempCanvas.getContext("2d")
    if (!tempCtx) return layer

    tempCtx.font = `${layer.fontSize || 24}px ${layer.fontFamily || 'Arial'}`
    const metrics = tempCtx.measureText(layer.text)
    const width = Math.max(metrics.width, 50)
    const height = (layer.fontSize || 24) + 10

    return { ...layer, width, height }
  }

  const addTextLayer = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const text = "Text"
    const fontSize = 24
    const fontFamily = "Arial"
    const color = "#000000"

    // Calculate center position
    const rect = canvas.getBoundingClientRect()
    const centerX = (rect.width / 2 - pan.x) / zoom
    const centerY = (rect.height / 2 - pan.y) / zoom

    const newLayer: Layer = {
      id: `layer-text-${Date.now()}`,
      type: 'text',
      text,
      fontSize,
      fontFamily,
      color,
      x: centerX - 50, // temporary width
      y: centerY - 17, // temporary height
      width: 100,
      height: 34,
      rotation: 0,
      name: 'Text Layer',
      visible: true,
    }

    const updatedLayer = updateTextLayerDimensions(newLayer)
    updatedLayer.x = centerX - updatedLayer.width / 2
    updatedLayer.y = centerY - updatedLayer.height / 2

    const updatedLayers = [...layers, updatedLayer]
    setLayers(updatedLayers)
    setSelectedLayerIds([updatedLayer.id])
    saveToHistory(updatedLayers, [updatedLayer.id])
  }


  const calculateDimensionsFromAspectRatio = (aspectRatio: string, baseSize: number) => {
    const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number)
    if (!widthRatio || !heightRatio) return { width: baseSize, height: baseSize }

    // Get divisor from selected service
    const selectedService = aiServices.find(s => s.id === selectedServiceId)
    const divisor = selectedService?.divisible || 4

    // Calculate dimensions maintaining aspect ratio
    const ratio = widthRatio / heightRatio
    let width: number, height: number

    if (ratio >= 1) {
      // Landscape or square
      width = baseSize
      height = Math.round(baseSize / ratio)
    } else {
      // Portrait
      height = baseSize
      width = Math.round(baseSize * ratio)
    }

    // Ensure divisible by the divisor
    width = Math.ceil(width / divisor) * divisor
    height = Math.ceil(height / divisor) * divisor

    return { width, height }
  }

  const addEmptyImageLayer = (width: number, height: number, aspectRatio: string) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Get divisor from selected service
    const selectedService = aiServices.find(s => s.id === selectedServiceId)
    const divisor = selectedService?.divisible || 4

    // Create empty canvas with specified dimensions
    const emptyCanvas = document.createElement("canvas")
    emptyCanvas.width = width
    emptyCanvas.height = height
    const ctx = emptyCanvas.getContext("2d")
    if (!ctx) return

    // Fill with transparent background
    ctx.clearRect(0, 0, width, height)

    // Convert to image
    const img = new window.Image()
    img.onload = () => {
      // Calculate center position
      const rect = canvas.getBoundingClientRect()
      const centerX = (rect.width / 2 - pan.x) / zoom
      const centerY = (rect.height / 2 - pan.y) / zoom

      // Use provided dimensions (max dimension constraint not applied to generated empty images)
      let finalWidth = width
      let finalHeight = height

      // Ensure they are divisible by the divisor
      finalWidth = Math.ceil(finalWidth / divisor) * divisor
      finalHeight = Math.ceil(finalHeight / divisor) * divisor

      const newLayer: Layer = {
        id: `layer-empty-${Date.now()}`,
        type: 'image',
        image: img,
        x: centerX - finalWidth / 2,
        y: centerY - finalHeight / 2,
        width: finalWidth,
        height: finalHeight,
        rotation: 0,
        name: `Empty Image ${aspectRatio} (${finalWidth}x${finalHeight})`,
        visible: true,
      }

      const updatedLayers = [...layers, newLayer]
      setLayers(updatedLayers)
      setSelectedLayerIds([newLayer.id])
      saveToHistory(updatedLayers, [newLayer.id])
    }
    img.src = emptyCanvas.toDataURL()
  }

  const captureCanvasAsLayer = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      // Temporarily hide selection for export
      drawCanvas(true, false)

      setTimeout(async () => {
        canvas.toBlob(async (blob) => {
          if (!blob) return

          // Create image from blob and add as new layer
          const img = new window.Image()
          img.onload = async () => {
            // Crop transparent parts
            const croppedImg = await cropTransparent(img)

            const newLayer: Layer = {
              id: `layer-canvas-${Date.now()}`,
              type: 'image',
              image: croppedImg,
              x: 100,
              y: 100,
              width: croppedImg.width,
              height: croppedImg.height,
              rotation: 0,
              name: 'Canvas Layer',
              visible: true,
            }

            const updatedLayers = [...layers, newLayer]
            setLayers(updatedLayers)
            setSelectedLayerIds([newLayer.id])
            saveToHistory(updatedLayers, [newLayer.id])

            // Force canvas redraw
            setForceRedraw(prev => prev + 1)
          }
          img.src = URL.createObjectURL(blob)

          // Restore canvas display
          drawCanvas(false, true)
        })
      }, 50)
    } catch (error) {
      alert('Failed to capture canvas')
    }
  }


  const convertLayer = async (service: any) => {
    // Check if service input type is text
    const isTextService = service.inputTypes && service.inputTypes.includes("text")

    // Check if service requires 2 layers
    const inputImage1Param = service.parameters.find((p: any) => p.name === 'input_image1' && p.ui === false)
    const inputImage2Param = service.parameters.find((p: any) => p.name === 'input_image2' && p.ui === false)
    const startImageParam = service.parameters.find((p: any) => p.name === 'start_image' && p.ui === false)
    const endImageParam = service.parameters.find((p: any) => p.name === 'end_image' && p.ui === false)

    let inputLayers: Layer[] = []
    if ((inputImage1Param && inputImage2Param) || (startImageParam && endImageParam)) {
      // Service requires 2 layers
      if (selectedLayers.length !== 2) return
      inputLayers = selectedLayers
    } else {
      // Service requires 1 layer
      if (!primarySelectedLayer) return
      inputLayers = [primarySelectedLayer]
    }

    if (!useLocalApi && !serviceTostaiToken) {
      // Create a temporary error job for display
      const errorJob: ServiceJob = {
        id: generateJobId(),
        serviceId: service.id,
        serviceName: service.name,
        progress: 100,
        status: "Error: Please configure TostAI token first in API Configuration",
        apiStatus: "FAILED",
        result: { error: true, message: "Please configure TostAI token first in API Configuration" },
        timing: null,
        options: null,
        polling: false,
        layerId: inputLayers[0]?.id
      }
      setServiceJobs(prev => [...prev, errorJob])
      return
    }

    const jobId = generateJobId()
    const newJob: ServiceJob = {
      id: jobId,
      serviceId: service.id,
      serviceName: service.name,
      progress: 0,
      status: "Capturing selected layer...",
      apiStatus: "",
      result: null,
      timing: null,
      options: {
        prompt: service.prompt || service.positive_prompt || '',
        instruction: service.instruction || '',
        loraModel: getLoraModelForService(service.id),
        layerName: service.name
      },
      polling: false,
      layerId: inputLayers[0].id,
      inputLayer: inputLayers[0] // Store the actual layer data as backup
    }

    setServiceJobs(prev => [...prev, newJob])

    try {
      let uploadResults: { paramName: string, url: string }[] = []

      if (!isTextService) {
        // Handle uploads for each input layer (only for non-text services)
        const uploadPromises: Promise<{ paramName: string, url: string }>[] = []

        for (let i = 0; i < inputLayers.length; i++) {
          const layer = inputLayers[i]
          let paramName: string

          if (inputLayers.length === 2) {
            // For 2-layer services, check what parameter names the service uses
            if (startImageParam && endImageParam) {
              // Services like wan2.2-i2v-flf use start_image and end_image
              paramName = i === 0 ? 'start_image' : 'end_image'
            } else {
              // Default to input_image1 and input_image2
              paramName = `input_image${i + 1}`
            }
          } else {
            // For single layer services, check what parameter name the service uses
            const inputImageParam = service.parameters.find((p: any) => p.name === 'input_image' && p.ui === false)
            const inputImage1Param = service.parameters.find((p: any) => p.name === 'input_image1' && p.ui === false)
            const inputImageCheckParam = service.parameters.find((p: any) => p.name === 'input_image_check' && p.ui === false)

            if (inputImageParam) {
              paramName = 'input_image'
            } else if (inputImage1Param) {
              paramName = 'input_image1'
            } else if (inputImageCheckParam) {
              paramName = 'input_image_check'
            } else {
              // Fallback
              paramName = 'input_image'
            }
          }

          const uploadPromise = (async () => {
            try {
              // Create canvas for selected layer
              const canvas = document.createElement("canvas")
              canvas.width = layer.width
              canvas.height = layer.height
              const ctx = canvas.getContext("2d")
              if (!ctx) throw new Error("Could not get canvas context")

              if (layer.type === 'image' && layer.image) {
                ctx.drawImage(layer.image, 0, 0, layer.width, layer.height)
              } else if (layer.type === 'text' && layer.text) {
                ctx.font = `${layer.fontSize || 24}px ${layer.fontFamily || 'Arial'}`
                ctx.fillStyle = layer.color || '#000000'
                ctx.fillText(layer.text, 0, layer.fontSize || 24)
              } else if (layer.type === 'video' && layer.video) {
                ctx.drawImage(layer.video, 0, 0, layer.width, layer.height)
              } else if (layer.type === 'glb') {
                // GLB layers are rendered as overlays, so they won't be captured in canvas
                // Skip GLB layers in canvas capture
              }

              const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
              if (!blob) throw new Error("Could not create blob")

              // Upload to tost.ai or MinIO
              const formData = new FormData()
              formData.append('file', blob, `selected-layer-${i + 1}.png`)
              formData.append('useLocal', useLocalApi.toString())
              formData.append('localUploadUrl', localUploadUrl)

              const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
              })

              if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text()
                console.error('Upload API Error Response:', errorText)
                let errorMessage = errorText
                try {
                  const errorData = JSON.parse(errorText)
                  if (errorData.error) {
                    errorMessage = errorData.error
                  }
                } catch (e) {
                  // If JSON parsing fails, use the raw text
                }

                // Provide more helpful error messages based on common upload issues
                let helpfulMessage = errorMessage
                if (uploadResponse.status === 413 ||
                    errorMessage.toLowerCase().includes('too large') ||
                    errorMessage.toLowerCase().includes('size') ||
                    errorMessage.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
                    errorMessage.includes('Request Entity Too Large')) {
                  helpfulMessage = `Image is too large. Try reducing the image size or dimensions.`
                } else if (uploadResponse.status === 415 || errorMessage.toLowerCase().includes('format') || errorMessage.toLowerCase().includes('type')) {
                  helpfulMessage = `Unsupported image format. Please use PNG, JPG, or WebP.`
                } else if (uploadResponse.status >= 500) {
                  helpfulMessage = `Server error during upload. Please try again later.`
                } else {
                  helpfulMessage = `Upload failed: ${errorMessage}. Check your connection and try again.`
                }

                throw new Error(helpfulMessage)
              }
              const uploadResult = await uploadResponse.json()

              return { paramName, url: uploadResult.url }
            } catch (uploadError) {
              // Update the existing service job with upload error instead of creating a new one
              setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                ...j,
                progress: 100,
                status: "Upload failed",
                apiStatus: "FAILED",
                result: { error: true, message: processErrorMessage(uploadError instanceof Error ? uploadError.message : "Upload failed") },
                polling: false
              } : j))
              throw uploadError // Re-throw to stop processing
            }
          })()

          uploadPromises.push(uploadPromise)
        }

        // Update job progress
        setServiceJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: 60, status: `Processing...` } : j))

        // Wait for all uploads to complete
        uploadResults = await Promise.all(uploadPromises)
      }

      // Prepare payload using all service parameters
      // jobId is already defined above

      // Build input object with all service parameters
      const inputData: any = {
        job_id: jobId,
      }

      // Add only parameters defined in service.parameters
      service.parameters.forEach((param: any) => {
        const paramValue = service[param.name]
        if (paramValue !== undefined && paramValue !== '' && param.name !== 'job_id') {
          inputData[param.name] = paramValue
        }
      })

      // Set uploaded image URLs to input data (only for non-text services)
      if (!isTextService) {
        uploadResults.forEach(({ paramName, url }) => {
          inputData[paramName] = url
        })
      }

      // Set inputData width and height based on custom_size setting
      if (service.custom_size) {
        inputData.width = Math.round(service.width)
        inputData.height = Math.round(service.height)
      } else {
        // For services with start_image and end_image, use the biggest width and height
        if (inputLayers.length === 2 && startImageParam && endImageParam) {
          const maxWidth = Math.max(inputLayers[0].width, inputLayers[1].width)
          const maxHeight = Math.max(inputLayers[0].height, inputLayers[1].height)
          inputData.width = Math.round(maxWidth)
          inputData.height = Math.round(maxHeight)
        } else {
          inputData.width = Math.round(inputLayers[0].width)
          inputData.height = Math.round(inputLayers[0].height)
        }
      }

      const payload = {
        webhook: serviceWebhookUrl || undefined,
        input: inputData
      }

      // Call API (TostAI or Local)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "workerId": service.workerId,
        "cost": service.cost,
        "delay": service.delay,
      }

      let response: Response
      if (useLocalApi) {
        // Use Next.js API route proxy to avoid CORS issues
        response = await fetch('/api/run', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            serviceId: service.id,
            payload: payload,
            localApiUrl: localApiUrl
          }),
        })
      } else {
        // Use proxy server with token in URL path
        const apiUrl = `https://api.tost.ai/set/${serviceTostaiToken}`
        response = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error Response:', errorText)
        let errorMessage = errorText
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch (e) {
          // If JSON parsing fails, use the raw text
        }
        throw new Error(`API request failed: ${errorMessage}`)
      }

      const result = await response.json()

      setServiceJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: 60, status: "Processing..." } : j))

      // Handle different response statuses
     if (result.status === "COMPLETED" && result.output?.result) {
       setServiceJobs(prev => prev.map(j => j.id === jobId ? {
         ...j,
         status: "Processing complete!",
         apiStatus: "COMPLETED",
         progress: 100,
         timing: {
           delayTime: result.delayTime || 0,
           executionTime: result.executionTime || 0
         }
       } : j))
       await handleServiceResult(result.output.result, service.name, {
         delayTime: result.delayTime || 0,
         executionTime: result.executionTime || 0
       }, service.prompt || service.positive_prompt || '', service.instruction || '', service, jobId, newJob, result.billing)
      } else if (result.status === "FAILED") {
        setServiceJobs(prev => prev.map(j => j.id === jobId ? {
          ...j,
          status: "Processing failed",
          apiStatus: "FAILED",
          progress: 100,
          result: { error: true, message: processErrorMessage(result.error || "Job failed") },
          polling: false
        } : j))
      } else if (result.status === "IN_PROGRESS") {
        // Job is still processing - for local API we check status once, for proxy server this is unexpected
        if (useLocalApi) {
          // For local API, make a single status check instead of polling
          setTimeout(async () => {
            try {
              const statusResponse = await fetch(`/api/status/${result.id}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ localApiUrl }),
              })

              if (statusResponse.ok) {
                const statusResult = await statusResponse.json()
                if (statusResult.status === "COMPLETED" && statusResult.output?.result) {
                  setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                    ...j,
                    status: "Processing complete!",
                    apiStatus: "COMPLETED",
                    progress: 100,
                    timing: {
                      delayTime: statusResult.delayTime || 0,
                      executionTime: statusResult.executionTime || 0
                    }
                  } : j))
                  await handleServiceResult(statusResult.output.result, service.name, {
                    delayTime: statusResult.delayTime || 0,
                    executionTime: statusResult.executionTime || 0
                  }, service.prompt || service.positive_prompt || '', service.instruction || '', service, jobId, newJob, statusResult.billing)
                } else if (statusResult.status === "FAILED") {
                  setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                    ...j,
                    status: "Processing failed",
                    apiStatus: "FAILED",
                    progress: 100,
                    result: { error: true, message: processErrorMessage(statusResult.error || "Job failed") }
                  } : j))
                } else {
                  // Still in progress or unknown status
                  setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                    ...j,
                    status: "Processing...",
                    apiStatus: statusResult.status || "IN_PROGRESS",
                    progress: 80
                  } : j))
                }
              }
            } catch (error) {
              console.error('Status check error:', error)
              setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                ...j,
                status: "Status check failed",
                apiStatus: "FAILED",
                progress: 100,
                result: { error: true, message: "Failed to check job status" }
              } : j))
            }
          }, 1000) // Check status after 1 second

          setServiceJobs(prev => prev.map(j => j.id === jobId ? {
            ...j,
            tostaiJobId: result.id,
            status: "Processing...",
            apiStatus: "IN_PROGRESS",
            progress: 70
          } : j))
        } else {
          // Proxy server should handle polling internally, so IN_PROGRESS is unexpected
          setServiceJobs(prev => prev.map(j => j.id === jobId ? {
            ...j,
            status: "Processing failed - proxy server returned unexpected status",
            apiStatus: "FAILED",
            progress: 100,
            result: { error: true, message: "Proxy server returned IN_PROGRESS status instead of final result" }
          } : j))
        }
      } else {
        // Handle unexpected response formats more gracefully
        console.warn("Unexpected response format from proxy server:", result)

        // Try to extract result URL from various possible formats
        let resultUrl = null
        if (result.output?.result) {
          resultUrl = result.output.result
        } else if (result.result) {
          resultUrl = result.result
        } else if (result.url) {
          resultUrl = result.url
        }

        if (resultUrl) {
          // Validate that resultUrl is actually a URL and not a parameter name
          try {
            new URL(resultUrl)
            // If we found a valid result URL, treat it as successful
            setServiceJobs(prev => prev.map(j => j.id === jobId ? {
              ...j,
              status: "Processing complete!",
              apiStatus: "COMPLETED",
              progress: 100,
              timing: {
                delayTime: result.delayTime || 0,
                executionTime: result.executionTime || 0
              }
            } : j))
            await handleServiceResult(resultUrl, service.name, {
              delayTime: result.delayTime || 0,
              executionTime: result.executionTime || 0
            }, service.prompt || service.positive_prompt || '', service.instruction || '', service, jobId, newJob, result.billing)
          } catch (urlError) {
            // resultUrl is not a valid URL - this indicates API response parsing issue
            console.error('Invalid result URL received from API:', resultUrl, 'Full result:', result)
            setServiceJobs(prev => prev.map(j => j.id === jobId ? {
              ...j,
              progress: 100,
              status: "API returned invalid result URL",
              apiStatus: "FAILED",
              result: { error: true, message: `API returned invalid result URL: ${resultUrl}` },
              polling: false
            } : j))
          }
        } else {
          // If no result URL found, treat as error - extract meaningful error message
          let errorMessage = "Processing failed - unexpected response format"

          // Try to extract billing note if available
          if (result.billing?.note) {
            errorMessage = result.billing.note
          } else if (result.status === "CANCELLED") {
            errorMessage = "Job was cancelled"
          } else if (result.error) {
            errorMessage = result.error
          }

          setServiceJobs(prev => prev.map(j => j.id === jobId ? {
            ...j,
            status: "Processing failed",
            apiStatus: "FAILED",
            progress: 100,
            result: { error: true, message: errorMessage },
            polling: false
          } : j))
        }
      }

    } catch (error) {
      console.error('Service conversion error:', error)
      setServiceJobs(prev => prev.map(j => j.id === jobId ? {
        ...j,
        progress: 100,
        status: "Processing failed",
        apiStatus: "FAILED",
        result: {
          error: true,
          message: processErrorMessage(error instanceof Error ? error.message : "Processing failed"),
        },
        polling: false
      } : j))
    }
  }


  const cropTransparent = (img: HTMLImageElement): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(img)
        return
      }

      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      let minX = canvas.width
      let minY = canvas.height
      let maxX = 0
      let maxY = 0

      // Find bounding box of non-transparent pixels
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4
          const alpha = data[index + 3]
          if (alpha > 0) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }

      // If no non-transparent pixels found, return original
      if (minX > maxX || minY > maxY) {
        resolve(img)
        return
      }

      const croppedWidth = maxX - minX + 1
      const croppedHeight = maxY - minY + 1

      const croppedCanvas = document.createElement('canvas')
      croppedCanvas.width = croppedWidth
      croppedCanvas.height = croppedHeight
      const croppedCtx = croppedCanvas.getContext('2d')
      if (!croppedCtx) {
        resolve(img)
        return
      }

      croppedCtx.drawImage(canvas, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight)

      const croppedImg = new window.Image()
      croppedImg.onload = () => resolve(croppedImg)
      croppedImg.onerror = () => resolve(img)
      croppedImg.src = croppedCanvas.toDataURL()
    })
  }


  const handleServiceResult = async (resultUrl: string, layerName = "AI Generated Content", timing?: { delayTime?: number, executionTime?: number }, prompt?: string, instruction?: string, service?: any, jobId?: string, job?: any, billing?: { costPerSecond: number, deducted: number, remaining: number }) => {
    try {
      // Find the job to get the input layer ID
      const foundJob = job || (jobId ? serviceJobs.find(j => j.id === jobId) : null)

      // Check if this is a video service
      const isVideoService = service?.category === "video"

      if (isVideoService) {
        // Handle video result - fetch and create blob URL for seekability
        fetch(`/api/image-proxy?url=${encodeURIComponent(resultUrl)}&local=${useLocalApi}`)
          .then(response => {
            if (!response.ok) throw new Error('Failed to fetch video')
            return response.blob()
          })
          .then(blob => {
            const video = document.createElement('video')
            video.crossOrigin = "anonymous"
            video.preload = 'auto'
            video.src = URL.createObjectURL(blob)

            // Handle duration updates when metadata loads
            const handleMetadataLoaded = () => {
              // Update duration in existing layer if it exists
              setLayers(currentLayers => {
                return currentLayers.map(layer => {
                  if (layer.type === 'video' && layer.video === video && (!layer.duration || layer.duration !== video.duration)) {
                    return { ...layer, duration: video.duration }
                  }
                  return layer
                })
              })
            }

            video.addEventListener('loadedmetadata', handleMetadataLoaded)
            video.addEventListener('durationchange', handleMetadataLoaded)

            video.onloadeddata = () => {
              // Use functional update to ensure we have the latest layers state
              setLayers(currentLayers => {
                // Find the current input layer by ID to get its current position/size
                // First try to find it in current layers, then fall back to stored layer data
                let inputLayer = foundJob?.layerId ? currentLayers.find(l => l.id === foundJob.layerId) : null
                if (!inputLayer && foundJob?.inputLayer) {
                  // Use stored layer data as fallback if layer was deleted
                  inputLayer = foundJob.inputLayer
                }

                // Determine target dimensions based on custom size setting
                let targetWidth: number, targetHeight: number
                if (service?.custom_size) {
                  // When custom size is enabled, use the actual result video dimensions
                  targetWidth = video.videoWidth
                  targetHeight = video.videoHeight
                } else {
                  targetWidth = inputLayer ? inputLayer.width : video.videoWidth
                  targetHeight = inputLayer ? inputLayer.height : video.videoHeight
                }

                const newLayer: Layer = {
                  id: `layer-ai-${Date.now()}`,
                  type: 'video',
                  video: video,
                  videoUrl: `/api/image-proxy?url=${encodeURIComponent(resultUrl)}&local=${useLocalApi}`,
                  currentTime: 0,
                  duration: video.duration || 0, // Use 0 as fallback if duration not available yet
                  isPlaying: false,
                  x: inputLayer ? inputLayer.x : 200,
                  y: inputLayer ? inputLayer.y : 200,
                  width: targetWidth,
                  height: targetHeight,
                  rotation: 0,
                  name: layerName,
                  visible: true,
                  delayTime: timing?.delayTime,
                  executionTime: timing?.executionTime,
                  prompt,
                  instruction,
                  resultUrl,
                  serviceId: service.id,
                  billing,
                }

                // Handle time updates during playback
                const handleTimeUpdate = () => {
                  setLayers(currentLayers => {
                    return currentLayers.map(layerItem => {
                      if (layerItem.type === 'video' && layerItem.video === video) {
                        return { ...layerItem, currentTime: video.currentTime }
                      }
                      return layerItem
                    })
                  })
                }

                video.addEventListener('timeupdate', handleTimeUpdate)

                const updatedLayers = [...currentLayers, newLayer]
                setSelectedLayerIds([newLayer.id])
                saveToHistory(updatedLayers, [newLayer.id])

                // Single force redraw instead of multiple rapid redraws to prevent unresponsiveness
                setForceRedraw(prev => prev + 1)

                return updatedLayers
              })

              // Update job status
              if (jobId) {
                setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                  ...j,
                  progress: 100,
                  status: "AI generated video added to canvas successfully!",
                  apiStatus: "COMPLETED",
                  result: { success: true, message: "AI generated video added to canvas successfully!" },
                  polling: false
                } : j))
              }
            }

            video.onerror = () => {
              if (jobId) {
                setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                  ...j,
                  progress: 100,
                  status: "Failed to load result video from API",
                  apiStatus: "FAILED",
                  result: { error: true, message: "Failed to load result video from API" },
                  polling: false
                } : j))
              }
            }
          })
          .catch(error => {
            console.error('Video fetch error:', error)
            if (jobId) {
              setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                ...j,
                progress: 100,
                status: "Failed to fetch video from API",
                apiStatus: "FAILED",
                result: { error: true, message: "Failed to fetch video from API" },
                polling: false
              } : j))
            }
          })
      } else if (resultUrl.toLowerCase().endsWith('.glb') || resultUrl.toLowerCase().endsWith('.gltf')) {
        // Handle GLB result
        const glbUrl = `/api/image-proxy?url=${encodeURIComponent(resultUrl)}&local=${useLocalApi}`

        // Generate thumbnail for the GLB
        generateGLBThumbnail(glbUrl).then(async thumbnail => {
          const croppedThumbnail = await cropTransparent(thumbnail)

          // Use functional update to ensure we have the latest layers state
          setLayers(currentLayers => {
            // Find the current input layer by ID to get its current position/size
            // First try to find it in current layers, then fall back to stored layer data
            let inputLayer = foundJob?.layerId ? currentLayers.find(l => l.id === foundJob.layerId) : null
            if (!inputLayer && foundJob?.inputLayer) {
              // Use stored layer data as fallback if layer was deleted
              inputLayer = foundJob.inputLayer
            }

            // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
            const aspectRatio = croppedThumbnail.width / croppedThumbnail.height

            let width: number, height: number
            if (maxDimensionEnabled) {
              if (croppedThumbnail.width > croppedThumbnail.height) {
                // Landscape thumbnail
                width = Math.min(croppedThumbnail.width, maxDimension)
                height = width / aspectRatio
              } else {
                // Portrait or square thumbnail
                height = Math.min(croppedThumbnail.height, maxDimension)
                width = height * aspectRatio
              }
            } else {
              // Use original dimensions
              width = croppedThumbnail.width
              height = croppedThumbnail.height
            }

            // Ensure they are divisible by 4
            width = Math.ceil(width / 4) * 4
            height = Math.ceil(height / 4) * 4

            // Create thumbnail layer (represents the GLB)
            const thumbnailLayer: Layer = {
              id: `layer-ai-glb-${Date.now()}`,
              type: 'image',
              image: croppedThumbnail,
              x: inputLayer ? inputLayer.x : 200,
              y: inputLayer ? inputLayer.y : 200,
              width,
              height,
              rotation: 0,
              name: layerName,
              visible: true,
              isGlbThumbnail: true,
              glbUrl: glbUrl,
              delayTime: timing?.delayTime,
              executionTime: timing?.executionTime,
              prompt,
              instruction,
              resultUrl,
              serviceId: service.id,
              billing,
            }

            const updatedLayers = [...currentLayers, thumbnailLayer]
            setSelectedLayerIds([thumbnailLayer.id])
            saveToHistory(updatedLayers, [thumbnailLayer.id])

            // Force canvas redraw by triggering state update
            setForceRedraw(prev => prev + 1)

            return updatedLayers
          })
        }).catch(async error => {
          console.error('Failed to generate GLB thumbnail:', error)
          // Use dummy box thumbnail as fallback
          try {
            const dummyThumbnail = await generateDummyBoxThumbnail()
            const croppedDummyThumbnail = await cropTransparent(dummyThumbnail)

            // Use functional update to ensure we have the latest layers state
            setLayers(currentLayers => {
              // Find the current input layer by ID to get its current position/size
              // First try to find it in current layers, then fall back to stored layer data
              let inputLayer = foundJob?.layerId ? currentLayers.find(l => l.id === foundJob.layerId) : null
              if (!inputLayer && foundJob?.inputLayer) {
                // Use stored layer data as fallback if layer was deleted
                inputLayer = foundJob.inputLayer
              }

              // Calculate dimensions maintaining aspect ratio, with max dimension if enabled
              const aspectRatio = croppedDummyThumbnail.width / croppedDummyThumbnail.height

              let width: number, height: number
              if (maxDimensionEnabled) {
                if (croppedDummyThumbnail.width > croppedDummyThumbnail.height) {
                  // Landscape thumbnail
                  width = Math.min(croppedDummyThumbnail.width, maxDimension)
                  height = width / aspectRatio
                } else {
                  // Portrait or square thumbnail
                  height = Math.min(croppedDummyThumbnail.height, maxDimension)
                  width = height * aspectRatio
                }
              } else {
                // Use original dimensions
                width = croppedDummyThumbnail.width
                height = croppedDummyThumbnail.height
              }

              // Ensure they are divisible by 4
              width = Math.ceil(width / 4) * 4
              height = Math.ceil(height / 4) * 4

              // Create thumbnail layer (represents the GLB)
              const thumbnailLayer: Layer = {
                id: `layer-ai-glb-${Date.now()}`,
                type: 'image',
                image: croppedDummyThumbnail,
                x: inputLayer ? inputLayer.x : 200,
                y: inputLayer ? inputLayer.y : 200,
                width,
                height,
                rotation: 0,
                name: layerName,
                visible: true,
                isGlbThumbnail: true,
                glbUrl: glbUrl,
                delayTime: timing?.delayTime,
                executionTime: timing?.executionTime,
                prompt,
                instruction,
                resultUrl,
                serviceId: service.id,
                billing,
              }

              const updatedLayers = [...currentLayers, thumbnailLayer]
              setSelectedLayerIds([thumbnailLayer.id])
              saveToHistory(updatedLayers, [thumbnailLayer.id])

              // Force canvas redraw by triggering state update
              setForceRedraw(prev => prev + 1)

              return updatedLayers
            })

            // Update job status to success
            if (jobId) {
              setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                ...j,
                progress: 100,
                status: "AI generated GLB added to canvas successfully!",
                apiStatus: "COMPLETED",
                result: { success: true, message: "AI generated GLB added to canvas successfully!" },
                polling: false
              } : j))
            }
          } catch (dummyError) {
            console.error('Failed to generate dummy thumbnail:', dummyError)
            // Now fail the job
            if (jobId) {
              setServiceJobs(prev => prev.map(j => j.id === jobId ? {
                ...j,
                progress: 100,
                status: "Failed to generate GLB thumbnail",
                apiStatus: "FAILED",
                result: { error: true, message: "Failed to generate GLB thumbnail" },
                polling: false
              } : j))
            }
          }
        })

        // Update job status
        if (jobId) {
          setServiceJobs(prev => prev.map(j => j.id === jobId ? {
            ...j,
            progress: 100,
            status: "AI generated GLB added to canvas successfully!",
            apiStatus: "COMPLETED",
            result: { success: true, message: "AI generated GLB added to canvas successfully!" },
            polling: false
          } : j))
        }
      } else {
        // Handle image result (existing logic)
        const img = new window.Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          // Use functional update to ensure we have the latest layers state
          setLayers(currentLayers => {
            // Find the current input layer by ID to get its current position/size
            // First try to find it in current layers, then fall back to stored layer data
            let inputLayer = foundJob?.layerId ? currentLayers.find(l => l.id === foundJob.layerId) : null
            if (!inputLayer && foundJob?.inputLayer) {
              // Use stored layer data as fallback if layer was deleted
              inputLayer = foundJob.inputLayer
            }

            // Determine target dimensions based on custom size setting
            let targetWidth: number, targetHeight: number
            if (service?.custom_size || service?.upscale_size) {
              // When custom size is enabled, use the actual result image dimensions
              targetWidth = img.width
              targetHeight = img.height
            } else {
              targetWidth = inputLayer ? inputLayer.width : img.width
              targetHeight = inputLayer ? inputLayer.height : img.height
            }

            const newLayer: Layer = {
              id: `layer-ai-${Date.now()}`,
              type: 'image',
              image: img,
              x: inputLayer ? inputLayer.x : 200,
              y: inputLayer ? inputLayer.y : 200,
              width: targetWidth,
              height: targetHeight,
              rotation: 0,
              name: layerName,
              visible: true,
              delayTime: timing?.delayTime,
              executionTime: timing?.executionTime,
              prompt,
              instruction,
              resultUrl,
              serviceId: service.id,
              billing,
            }

            const updatedLayers = [...currentLayers, newLayer]
            setSelectedLayerIds([newLayer.id])
            saveToHistory(updatedLayers, [newLayer.id])

            // Force canvas redraw by triggering state update
            setForceRedraw(prev => prev + 1)

            // Additional forced redraws as backup
            setTimeout(() => setForceRedraw(prev => prev + 1), 50)
            setTimeout(() => setForceRedraw(prev => prev + 1), 150)

            return updatedLayers
          })

          // Update job status
          if (jobId) {
            setServiceJobs(prev => prev.map(j => j.id === jobId ? {
              ...j,
              progress: 100,
              status: "AI edited image added to canvas successfully!",
              apiStatus: "COMPLETED",
              result: { success: true, message: "AI edited image added to canvas successfully!" },
              polling: false
            } : j))
          }
        }
        img.onerror = () => {
          if (jobId) {
            setServiceJobs(prev => prev.map(j => j.id === jobId ? {
              ...j,
              progress: 100,
              status: "Failed to load result image from API",
              apiStatus: "FAILED",
              result: { error: true, message: "Failed to load result image from API" },
              polling: false
            } : j))
          }
        }
        img.src = `/api/image-proxy?url=${encodeURIComponent(resultUrl)}&local=${useLocalApi}`
      }
    } catch (error) {
      if (jobId) {
        setServiceJobs(prev => prev.map(j => j.id === jobId ? {
          ...j,
          progress: 100,
          status: "Failed to process result",
          apiStatus: "FAILED",
          result: { error: true, message: "Failed to process result" },
          polling: false
        } : j))
      }
    }
  }



  const moveLayerUp = (layerId: string) => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === layerId)
      if (index === prev.length - 1) return prev
      const newLayers = [...prev]
      ;[newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]]
      saveToHistory(newLayers, selectedLayerIds)
      return newLayers
    })
  }

  const moveLayerDown = (layerId: string) => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === layerId)
      if (index === 0) return prev
      const newLayers = [...prev]
      ;[newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]]
      saveToHistory(newLayers, selectedLayerIds)
      return newLayers
    })
  }

  const moveLayerToTop = (layerId: string) => {
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === layerId)
      if (!layer) return prev
      const newLayers = [...prev.filter((l) => l.id !== layerId), layer]
      saveToHistory(newLayers, selectedLayerIds)
      return newLayers
    })
  }

  const moveLayerToBottom = (layerId: string) => {
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === layerId)
      if (!layer) return prev
      const newLayers = [layer, ...prev.filter((l) => l.id !== layerId)]
      saveToHistory(newLayers, selectedLayerIds)
      return newLayers
    })
  }

  // AI Service management functions
  const moveServiceUp = (serviceId: string) => {
    setAiServices((prev) => {
      const index = prev.findIndex((s) => s.id === serviceId)
      if (index === prev.length - 1) return prev
      const newServices = [...prev]
      ;[newServices[index], newServices[index + 1]] = [newServices[index + 1], newServices[index]]
      return newServices
    })
  }

  const moveServiceDown = (serviceId: string) => {
    setAiServices((prev) => {
      const index = prev.findIndex((s) => s.id === serviceId)
      if (index === 0) return prev
      const newServices = [...prev]
      ;[newServices[index], newServices[index - 1]] = [newServices[index - 1], newServices[index]]
      return newServices
    })
  }

  const handleServiceDragStart = (e: React.DragEvent<HTMLDivElement>, serviceId: string) => {
    setDraggedServiceId(serviceId)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleServiceDragOver = (e: React.DragEvent<HTMLDivElement>, serviceId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverServiceId(serviceId)
  }

  const handleServiceDrop = (e: React.DragEvent<HTMLDivElement>, targetServiceId: string) => {
    e.preventDefault()
    if (!draggedServiceId || draggedServiceId === targetServiceId) {
      setDraggedServiceId(null)
      setDragOverServiceId(null)
      return
    }

    setAiServices((prev) => {
      const draggedIndex = prev.findIndex((s) => s.id === draggedServiceId)
      const targetIndex = prev.findIndex((s) => s.id === targetServiceId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const newServices = [...prev]
      const [draggedService] = newServices.splice(draggedIndex, 1)
      newServices.splice(targetIndex, 0, draggedService)

      return newServices
    })

    setDraggedServiceId(null)
    setDragOverServiceId(null)
  }

  const executeService = (serviceId: string) => {
    const service = aiServices.find(s => s.id === serviceId)
    if (!service) return

    convertLayer(service)
  }

  const loadTextFileContent = async (filePath: string, fileKey: string) => {
    try {
      const response = await fetch(filePath)
      if (response.ok) {
        const content = await response.text()
        setTextFileContents(prev => ({ ...prev, [fileKey]: content }))
      }
    } catch (error) {
      console.error('Failed to load text file:', error)
    }
  }

  const getTextFileKey = (serviceId: string, type: string, file: string) => {
    return `${serviceId}-${type}-${file}`
  }

  const getLoraModelForService = (serviceId: string) => {
    switch (serviceId) {
      case 'anime':
        return "Qwen-Image-Edit-2509-Photo-to-Anime_000001000.safetensors"
      case 'chibi':
        return "qwen_3d_chibi_lora_v1_000000820.safetensors"
      case 'color':
        return "PanelPainter_V2.safetensors"
      case 'enhance':
        return "qwen-edit-enhance_000004250.safetensors"
      default:
        return ""
    }
  }

  const checkTokenRemaining = async () => {
    if (!serviceTostaiToken.trim()) {
      alert('Please enter a TostAI token first')
      return
    }

    try {
      const response = await fetch(`https://api.tost.ai/get/${serviceTostaiToken}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      setTokenRemaining(data.remaining)
    } catch (error) {
      console.error('Failed to check token remaining:', error)
      alert('Failed to check token remaining. Please check your token and try again.')
    }
  }

  // Video playback functions
  const playVideo = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId)
    if (!layer || layer.type !== 'video' || !layer.video) {
      return
    }

    layer.video.play()
    setPlayingVideos(prev => new Set([...prev, layerId]))
    setLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, isPlaying: true } : l
    ))
  }

  const pauseVideo = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId)
    if (!layer || layer.type !== 'video' || !layer.video) {
      return
    }

    layer.video.pause()
    setPlayingVideos(prev => {
      const newSet = new Set(prev)
      newSet.delete(layerId)
      return newSet
    })
    setLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, isPlaying: false } : l
    ))
  }

  const seekVideo = (layerId: string, time: number) => {
    const layer = layers.find(l => l.id === layerId)
    if (!layer || layer.type !== 'video' || !layer.video) {
      return
    }


    // Ensure the video is ready and has a valid duration
    if (!layer.video.duration || layer.video.duration === 0 || isNaN(layer.video.duration)) {
      console.warn('seekVideo: Video not ready for seeking:', layerId, 'duration:', layer.video.duration)
      return
    }

    // Clamp the time to valid range
    const clampedTime = Math.max(0, Math.min(time, layer.video.duration))

    // Set seeking flag to prevent video loop from interfering
    isSeekingRef.current[layerId] = true

    try {
      const beforeTime = layer.video.currentTime
      layer.video.currentTime = clampedTime
      setLayers(prev => prev.map(l =>
        l.id === layerId ? { ...l, currentTime: clampedTime } : l
      ))

      // Clear seeking flag after a short delay to allow video to update
      setTimeout(() => {
        delete isSeekingRef.current[layerId]
      }, 100)
    } catch (error) {
      console.error('seekVideo: Error seeking video:', error)
      delete isSeekingRef.current[layerId]
    }
  }

  // Canvas redraw loop for playing videos - optimized to reduce performance impact
  const startVideoLoop = () => {
    if (animationFrameRef.current) return

    let lastUpdateTime = 0
    const UPDATE_INTERVAL = 100 // Update currentTime every 100ms instead of every frame
    const DRAW_INTERVAL = 33 // Limit canvas redraws to ~30fps to prevent unresponsiveness

    const loop = (currentTime: number) => {
      if (playingVideos.size > 0) {
        // Throttle canvas redraws to prevent unresponsiveness during video playback
        if (currentTime - lastDrawTime.current > DRAW_INTERVAL) {
          drawCanvas()
          lastDrawTime.current = currentTime
        }

        // Throttle state updates to reduce re-renders
        if (currentTime - lastUpdateTime > UPDATE_INTERVAL) {
          setLayers(prev => prev.map(layer => {
            if (layer.type === 'video' && layer.video && playingVideos.has(layer.id)) {
              // Don't update currentTime if user is actively seeking
              const isSeeking = isSeekingRef.current[layer.id]
              const newCurrentTime = isSeeking ? (layer.currentTime || 0) : (layer.video.currentTime || 0)
              // Update slider value to match video playback
              setSliderValues(prev => ({ ...prev, [layer.id]: newCurrentTime }))
              return {
                ...layer,
                currentTime: newCurrentTime,
                duration: layer.video.duration || layer.duration // Update duration if it has changed
              }
            }
            return layer
          }))
          lastUpdateTime = currentTime
        }
      } else {
        stopVideoLoop()
        return
      }
      animationFrameRef.current = requestAnimationFrame(loop)
    }
    animationFrameRef.current = requestAnimationFrame(loop)
  }

  const stopVideoLoop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }

  // Service Properties resize handlers
  const handlePropertiesResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingProperties(true)
    setResizeStartY(e.clientY)
    setResizeStartHeight(servicePropertiesHeight)
  }

  const handlePropertiesResizeMove = (e: MouseEvent) => {
    if (!isResizingProperties) return

    const deltaY = e.clientY - resizeStartY
    const newHeight = resizeStartHeight - deltaY // Reverse direction for top handle

    // Constrain height between 100px and 600px
    const constrainedHeight = Math.max(100, Math.min(600, newHeight))
    setServicePropertiesHeight(constrainedHeight)
  }

  const handlePropertiesResizeEnd = () => {
    setIsResizingProperties(false)
  }

  // Touch versions for resize functionality
  const handlePropertiesResizeTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    setIsResizingProperties(true)
    setResizeStartY(e.touches[0].clientY)
    setResizeStartHeight(servicePropertiesHeight)
  }

  const handlePropertiesResizeTouchMove = (e: TouchEvent) => {
    if (!isResizingProperties) return

    const deltaY = e.touches[0].clientY - resizeStartY
    const newHeight = resizeStartHeight - deltaY // Reverse direction for top handle

    // Constrain height between 100px and 600px
    const constrainedHeight = Math.max(100, Math.min(600, newHeight))
    setServicePropertiesHeight(constrainedHeight)
  }

  const handlePropertiesResizeTouchEnd = () => {
    setIsResizingProperties(false)
  }

  const handleLayerDragStart = (e: React.DragEvent<HTMLDivElement>, layerId: string) => {
    setDraggedLayerId(layerId)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleLayerDragOver = (e: React.DragEvent<HTMLDivElement>, layerId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverLayerId(layerId)
  }

  const handleLayerDrop = (e: React.DragEvent<HTMLDivElement>, targetLayerId: string) => {
    e.preventDefault()
    if (!draggedLayerId || draggedLayerId === targetLayerId) {
      setDraggedLayerId(null)
      setDragOverLayerId(null)
      return
    }

    setLayers((prev) => {
      const draggedIndex = prev.findIndex((l) => l.id === draggedLayerId)
      const targetIndex = prev.findIndex((l) => l.id === targetLayerId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const newLayers = [...prev]
      const [draggedLayer] = newLayers.splice(draggedIndex, 1)
      newLayers.splice(targetIndex, 0, draggedLayer)

      saveToHistory(newLayers, selectedLayerIds)
      return newLayers
    })

    setDraggedLayerId(null)
    setDragOverLayerId(null)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle delete/backspace if user is typing in an input field
      const activeElement = document.activeElement as HTMLElement
      const isTypingInInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
      )

      if ((e.key === "Delete" || e.key === "Backspace") && selectedLayerIds.length > 0 && !isTypingInInput) {
        e.preventDefault()
        deleteSelectedLayer()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedLayerIds.length === 1 && !isTypingInInput) {
        e.preventDefault()
        copyLayerToClipboard(selectedLayerIds[0])
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      handlePropertiesResizeMove(e)
    }

    const handleMouseUp = () => {
      handlePropertiesResizeEnd()
    }

    const handleTouchMove = (e: TouchEvent) => {
      handlePropertiesResizeTouchMove(e)
    }

    const handleTouchEnd = () => {
      handlePropertiesResizeTouchEnd()
    }

    window.addEventListener("keydown", handleKeyDown)
    if (isResizingProperties) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      window.addEventListener("touchmove", handleTouchMove, { passive: false })
      window.addEventListener("touchend", handleTouchEnd, { passive: false })
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
    }
  }, [selectedLayerIds, historyIndex, history, isResizingProperties])

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="TostAI Logo" className="h-8 w-8" />
            <h1 className="text-lg font-bold text-foreground">Tost UI</h1>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (layerInputRef.current) {
                  layerInputRef.current.click()
                }
              }}
              type="button"
            >
              <Upload className="w-4 h-4 mr-2" />
              Add Media
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={addTextLayer}
              type="button"
            >
              <Type className="w-4 h-4 mr-2" />
              Add Text
            </Button>
            <input
              ref={layerInputRef}
              type="file"
              accept="image/*,video/*,.glb,.gltf"
              multiple
              onChange={handleLayerUpload}
              className="hidden"
            />

            <div className="flex items-center gap-1 border-l border-border pl-4">
              <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)">
                <Undo className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={historyIndex === history.length - 1}
                title="Redo (Ctrl+Y)"
              >
                <Redo className="w-4 h-4" />
              </Button>
            </div>

            <div className="text-sm text-muted-foreground border-l border-border pl-4">
              Zoom: {Math.round(zoom * 100)}%
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => setShowParametersPanel(!showParametersPanel)}>
              <Sliders className="w-4 h-4 mr-2" />
              AI Services
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowLayerPanel(!showLayerPanel)}>
              <Layers className="w-4 h-4 mr-2" />
              Layers
            </Button>
            <Button variant="outline" size="sm" onClick={captureCanvasAsLayer}>
              <Image className="w-4 h-4 mr-2" />
              Capture Canvas
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {showParametersPanel && (
           <div className="w-80 border-r border-border bg-card flex flex-col">
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-6">
                {/* AI Services List */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    {aiServices.map((service, index) => {
                      const isSelected = selectedServiceId === service.id
                      const actualIndex = aiServices.length - 1 - index
                      return (
                        <div
                          key={service.id}
                          draggable
                          onDragStart={(e) => handleServiceDragStart(e, service.id)}
                          onDragOver={(e) => handleServiceDragOver(e, service.id)}
                          onDrop={(e) => handleServiceDrop(e, service.id)}
                          onClick={() => setSelectedServiceId(service.id)}
                          className={cn(
                            "group flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10 border-primary" : "bg-background border-border hover:bg-muted",
                            dragOverServiceId === service.id && "border-primary border-2",
                          )}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                          <div className="flex-shrink-0 w-8 h-8 rounded border border-border bg-muted flex items-center justify-center">
                            {(() => {
                              const IconComponent = getServiceIconComponent(service.icon)
                              return <IconComponent className="h-4 w-4" />
                            })()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{service.name}</p>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                moveServiceDown(service.id)
                              }}
                              disabled={actualIndex === aiServices.length - 1}
                              className="h-5 w-5 p-0"
                              title="Move up"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                moveServiceUp(service.id)
                              }}
                              disabled={actualIndex === 0}
                              className="h-5 w-5 p-0"
                              title="Move down"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>

            </div>

            {/* Service Properties Panel - Only show when service has UI parameters */}
            {selectedServiceId && (() => {
              const selectedService = aiServices.find(s => s.id === selectedServiceId)
              const hasUIParameters = selectedService?.parameters?.some((param: any) => param.ui === true)
              return hasUIParameters ? (
                <div className="bg-muted/30">
                  <div className="p-3" data-properties-container>
                    <div className="space-y-3">
                      {/* Resize Handle - Top */}
                      <div
                        ref={resizeHandleRef}
                        className="flex items-center justify-center h-3 bg-border hover:bg-primary/50 cursor-row-resize transition-colors"
                        onMouseDown={handlePropertiesResizeStart}
                        onTouchStart={(e) => {
                          e.stopPropagation()
                          handlePropertiesResizeTouchStart(e)
                        }}
                        title="Drag to resize"
                      >
                        <div className="w-6 h-0.5 bg-muted-foreground/50 rounded"></div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          {useLocalApi && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Service Properties</p>
                            </div>
                          )}
                          {!useLocalApi && (
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-muted-foreground">Cost:</p>
                              {(() => {
                                const service = aiServices.find(s => s.id === selectedServiceId)
                                return service?.cost ? (
                                  <span className="text-xs text-green-600 font-medium">
                                    ${(parseFloat(service.cost) / 1000).toFixed(5)}/s
                                  </span>
                                ) : null
                              })()}
                              <p className="text-xs font-medium text-muted-foreground">Megapixel:</p>
                              {(() => {
                                const service = aiServices.find(s => s.id === selectedServiceId)
                                return service?.cost ? (
                                  <span className="text-xs text-green-600 font-medium">
                                    ~${((parseFloat(service.cost) * parseFloat(service.processingTime)) / 1000).toFixed(5)}
                                  </span>
                                ) : null
                              })()}
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const service = aiServices.find(s => s.id === selectedServiceId)
                              if (!service) return

                              // Reset all parameters to their default values
                              const resetValues: Record<string, any> = {}
                              service.parameters.forEach((param: any) => {
                                resetValues[param.name] = param.defaultValue ?? ''
                              })

                              setAiServices(prev => prev.map(s =>
                                s.id === selectedServiceId
                                  ? { ...s, ...resetValues }
                                  : s
                              ))
                            }}
                            className="text-xs h-6 px-2"
                          >
                            Reset
                          </Button>
                        </div>
                         <div
                           className="overflow-y-auto"
                           style={{ height: `${servicePropertiesHeight}px` }}
                           onTouchStart={(e) => e.stopPropagation()}
                           onTouchMove={(e) => e.stopPropagation()}
                           onTouchEnd={(e) => e.stopPropagation()}
                         >
                           <div className="space-y-2 px-2">
                            {(() => {
                              const selectedService = aiServices.find(s => s.id === selectedServiceId)
                              if (!selectedService || !selectedService.parameters) return null

                              const parametersToShow = selectedService.parameters.filter((param: any) => param.ui === true)

                              return parametersToShow
                                .filter((param: any) => param.name !== 'job_id') // Hide job_id parameter
                                .map((param: any) => {
                                const paramValue = param.type === 'boolean'
                                  ? Boolean(selectedService[param.name] ?? param.defaultValue)
                                  : selectedService[param.name] ?? param.defaultValue ?? ''
                                const label = param.label || param.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())

                                return (
                                  <div key={param.name} className="space-y-1">
                                    <Label htmlFor={`service-${selectedServiceId}-${param.name}`} className="text-xs">
                                      {label}
                                      {param.required && <span className="text-red-500 ml-1">*</span>}
                                    </Label>

                                    {param.type === 'string' && (param.name.includes('prompt') || param.name.includes('instruction') || param.name.includes('text')) ? (
                                      <Textarea
                                        id={`service-${selectedServiceId}-${param.name}`}
                                        value={paramValue}
                                        onChange={(e) => {
                                          setAiServices(prev => prev.map(s =>
                                            s.id === selectedServiceId
                                              ? { ...s, [param.name]: e.target.value }
                                              : s
                                          ))
                                        }}
                                        className="text-xs"
                                        placeholder={param.description || `Enter ${label.toLowerCase()}`}
                                        rows={3}
                                      />
                                    ) : param.type === 'string' ? (
                                      <Input
                                        id={`service-${selectedServiceId}-${param.name}`}
                                        type="text"
                                        value={paramValue}
                                        onChange={(e) => {
                                          setAiServices(prev => prev.map(s =>
                                            s.id === selectedServiceId
                                              ? { ...s, [param.name]: e.target.value }
                                              : s
                                          ))
                                        }}
                                        className="text-xs"
                                        placeholder={param.description || `Enter ${label.toLowerCase()}`}
                                      />
                                    ) : param.type === 'number' ? (
                                      <Input
                                        id={`service-${selectedServiceId}-${param.name}`}
                                        type="number"
                                        value={paramValue}
                                        onChange={(e) => {
                                          setAiServices(prev => prev.map(s =>
                                            s.id === selectedServiceId
                                              ? { ...s, [param.name]: parseInt(e.target.value) || 0 }
                                              : s
                                          ))
                                        }}
                                        className="text-xs"
                                        placeholder={param.description || `Enter ${label.toLowerCase()}`}
                                        min={param.min}
                                        max={param.max}
                                        step={param.step || 1}
                                      />
                                    ) : param.type === 'boolean' ? (
                                      <div className="flex items-center space-x-2">
                                        <Switch
                                          id={`service-${selectedServiceId}-${param.name}`}
                                          checked={paramValue}
                                          onCheckedChange={(checked) => {
                                            setAiServices(prev => prev.map(s =>
                                              s.id === selectedServiceId
                                                ? { ...s, [param.name]: checked }
                                                : s
                                            ))
                                          }}
                                        />
                                        <Label htmlFor={`service-${selectedServiceId}-${param.name}`} className="text-xs">
                                          {paramValue ? 'Enabled' : 'Disabled'}
                                        </Label>
                                      </div>
                                    ) : param.type === 'select' ? (
                                      <Select
                                        value={paramValue}
                                        onValueChange={(value) => {
                                          setAiServices(prev => prev.map(s =>
                                            s.id === selectedServiceId
                                              ? { ...s, [param.name]: value }
                                              : s
                                          ))
                                        }}
                                      >
                                        <SelectTrigger className="text-xs h-8">
                                          <SelectValue placeholder={param.description || `Select ${label.toLowerCase()}`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {param.options?.map((option: string) => (
                                            <SelectItem key={option} value={option} className="text-xs">
                                              {option}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : param.type === 'slider' ? (
                                      <div className="space-y-2">
                                        <Slider
                                          value={[paramValue]}
                                          onValueChange={(value) => {
                                            setAiServices(prev => prev.map(s =>
                                              s.id === selectedServiceId
                                                ? { ...s, [param.name]: value[0] }
                                                : s
                                            ))
                                          }}
                                          min={param.min || 0}
                                          max={param.max || 100}
                                          step={param.step || 1}
                                          className="w-full"
                                        />
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                          <span>{param.min || 0}</span>
                                          <span className="font-medium">{paramValue}</span>
                                          <span>{param.max || 100}</span>
                                        </div>
                                      </div>
                                    ) : param.type === 'file' ? (
                                      <div className="space-y-1">
                                        <Input
                                          id={`service-${selectedServiceId}-${param.name}`}
                                          type="text"
                                          value={paramValue}
                                          onChange={(e) => {
                                            setAiServices(prev => prev.map(s =>
                                              s.id === selectedServiceId
                                                ? { ...s, [param.name]: e.target.value }
                                                : s
                                            ))
                                          }}
                                          className="text-xs"
                                          placeholder={param.description || `Enter file URL for ${label.toLowerCase()}`}
                                        />
                                        {param.name.startsWith('input_image') && primarySelectedLayer && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={async () => {
                                              if (!primarySelectedLayer) return

                                              // Create canvas for selected layer
                                              const canvas = document.createElement("canvas")
                                              canvas.width = primarySelectedLayer.width
                                              canvas.height = primarySelectedLayer.height
                                              const ctx = canvas.getContext("2d")
                                              if (!ctx) return

                                              if (primarySelectedLayer.type === 'image' && primarySelectedLayer.image) {
                                                ctx.drawImage(primarySelectedLayer.image, 0, 0, primarySelectedLayer.width, primarySelectedLayer.height)
                                              } else if (primarySelectedLayer.type === 'text' && primarySelectedLayer.text) {
                                                ctx.font = `${primarySelectedLayer.fontSize || 24}px ${primarySelectedLayer.fontFamily || 'Arial'}`
                                                ctx.fillStyle = primarySelectedLayer.color || '#000000'
                                                ctx.fillText(primarySelectedLayer.text, 0, primarySelectedLayer.fontSize || 24)
                                              }

                                              const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
                                              if (!blob) return

                                              // Upload to tost.ai
                                              const formData = new FormData()
                                              formData.append('file', blob, `selected-layer-${Date.now()}.png`)

                                              try {
                                                const uploadResponse = await fetch('/api/upload', {
                                                  method: 'POST',
                                                  body: formData,
                                                })

                                                if (uploadResponse.ok) {
                                                  const uploadResult = await uploadResponse.json()
                                                  const imageUrl = uploadResult.url

                                                  setAiServices(prev => prev.map(s =>
                                                    s.id === selectedServiceId
                                                      ? { ...s, [param.name]: imageUrl }
                                                      : s
                                                  ))
                                                }
                                              } catch (error) {
                                                console.error('Failed to upload selected layer:', error)
                                              }
                                            }}
                                            className="text-xs h-6 w-full"
                                          >
                                            Set Selected Layer as {param.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <Input
                                        id={`service-${selectedServiceId}-${param.name}`}
                                        type="text"
                                        value={paramValue}
                                        onChange={(e) => {
                                          setAiServices(prev => prev.map(s =>
                                            s.id === selectedServiceId
                                              ? { ...s, [param.name]: e.target.value }
                                              : s
                                          ))
                                        }}
                                        className="text-xs"
                                        placeholder={param.description || `Enter ${label.toLowerCase()}`}
                                      />
                                    )}

                                    {param.description && (
                                      <p className="text-xs text-muted-foreground">{param.description}</p>
                                    )}
                                  </div>
                                )
                              })
                            })()}
                           </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null
            })()}

            {/* Run Button and Service Status - Always show when service is selected */}
            {selectedServiceId && (
              <div className="bg-muted/30">
                <div className="p-3 pt-0 pb-2">
                  {/* Hint for layer requirements */}
                  {(() => {
                    const selectedService = aiServices.find(s => s.id === selectedServiceId)
                    if (!selectedService || !selectedService.parameters) return null

                    const inputTypes = selectedService.inputTypes.includes("text")
                    const inputImageParam = selectedService.parameters.find((p: any) => p.name === 'input_image' && p.ui === false)
                    const inputImage1Param = selectedService.parameters.find((p: any) => p.name === 'input_image1' && p.ui === false)
                    const inputImage2Param = selectedService.parameters.find((p: any) => p.name === 'input_image2' && p.ui === false)
                    const inputImageCheckParam = selectedService.parameters.find((p: any) => p.name === 'input_image_check' && p.ui === false)
                    const startImageParam = selectedService.parameters.find((p: any) => p.name === 'start_image' && p.ui === false)
                    const endImageParam = selectedService.parameters.find((p: any) => p.name === 'end_image' && p.ui === false)

                    if ((inputImage1Param && inputImage2Param) || (startImageParam && endImageParam)) {
                      // Service requires 2 layers
                      if (selectedLayers.length !== 2) {
                        return (
                          <div className="text-xs text-green-600 text-center mb-3">
                            2 layers required for this service<br/>(hold Ctrl to select multiple layers)
                          </div>
                        )
                      }
                    } else if (inputImageParam || inputImage1Param || inputImageCheckParam || inputTypes) {
                      // Service requires 1 layer
                      if (!primarySelectedLayer) {
                        return (
                          <div className="text-xs text-green-600 text-center mb-3">
                            1 layer required for this service
                          </div>
                        )
                      }
                    }

                    return null
                  })()}

                  {/* Run Selected Service */}
                  <Button
                    onClick={() => executeService(selectedServiceId)}
                    disabled={(() => {
                      // Check API configuration first
                      if (useLocalApi && !localApiUrl.trim()) return true
                      if (!useLocalApi && !serviceTostaiToken.trim()) return true

                      const selectedService = aiServices.find(s => s.id === selectedServiceId)
                      if (!selectedService || !selectedService.parameters) return true

                      // Check if service has input_image1 and input_image2 or start_image and end_image with ui: false
                      const inputImage1Param = selectedService.parameters.find((p: any) => p.name === 'input_image1' && p.ui === false)
                      const inputImage2Param = selectedService.parameters.find((p: any) => p.name === 'input_image2' && p.ui === false)
                      const startImageParam = selectedService.parameters.find((p: any) => p.name === 'start_image' && p.ui === false)
                      const endImageParam = selectedService.parameters.find((p: any) => p.name === 'end_image' && p.ui === false)

                      // For services requiring 2 input images, need exactly 2 selected layers
                      if ((inputImage1Param && inputImage2Param) || (startImageParam && endImageParam)) {
                        if (selectedLayers.length !== 2) return true
                      } else {
                        // For other services, need at least one selected layer
                        if (!primarySelectedLayer) return true
                      }

                      // Check UI parameters
                      const uiParamsSatisfied = selectedService.parameters
                        .filter((param: any) => param.ui === true && param.required === true)
                        .every((param: any) => {
                          const value = selectedService[param.name]
                          return value !== undefined && value !== null && value !== ''
                        })

                      return !uiParamsSatisfied
                    })()}
                    className="w-full mb-3 bg-green-600 hover:bg-green-700 text-white"
                  >
                    Run {aiServices.find(s => s.id === selectedServiceId)?.name}
                  </Button>

                  {/* Active Jobs Progress */}
                  {serviceJobs.filter(job => job.progress < 100).length > 0 && (
                    <div className="space-y-3 mb-3">
                      <p className="text-xs font-medium text-muted-foreground">Active Jobs</p>
                      {serviceJobs.filter(job => job.progress < 100).map((job) => (
                        <div key={job.id} className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium truncate">{job.serviceName}: {job.status}</span>
                            <span>{job.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${job.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Completed Jobs with Errors */}
                  {serviceJobs.filter(job => job.result?.error).length > 0 && (
                    <div className="space-y-2 mb-3">
                      <p className="text-xs font-medium text-muted-foreground">Errors</p>
                      {serviceJobs.filter(job => job.result?.error).map((job) => (
                        <div key={job.id} className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start justify-between">
                          <div className="flex items-start">
                            <AlertCircle className="w-4 h-4 inline mr-1 mt-0.5 flex-shrink-0" />
                            <span>{job.serviceName}: {job.result.message}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setServiceJobs(prev => prev.filter(j => j.id !== job.id))
                            }}
                            className="h-4 w-4 p-0 ml-2 flex-shrink-0 hover:bg-red-100"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Quick Actions</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveServiceDown(selectedServiceId)}
                        className="text-xs"
                      >
                        <ChevronUp className="w-3 h-3 mr-1" />
                        Move Up
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveServiceUp(selectedServiceId)}
                        className="text-xs"
                      >
                        <ChevronDown className="w-3 h-3 mr-1" />
                        Move Down
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAiServices(prev => prev.filter(s => s.id !== selectedServiceId))
                          setSelectedServiceId(null)
                        }}
                        className="text-xs"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add Service Button - Fixed at Bottom */}
            <div className="bg-muted/30">
              <div className="p-3 pt-0">
                <Button
                  onClick={() => {
                    setShowServiceSelector(true)
                    // Close GLB viewer if open
                    if (showGlbViewer) {
                      setShowGlbViewer(false)
                      if (currentGlbUrl) {
                        setLayers(prev => prev.map(l => l.glbUrl === currentGlbUrl ? { ...l, visible: true } : l))
                      }
                      setCurrentGlbUrl(null)
                      setCurrentGlbTitle("")
                      setCurrentGlbPosition({ x: 100, y: 100 })
                      setCurrentGlbSize({ width: 600, height: 500 })
                    }
                  }}
                  className="w-full"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Service
                </Button>
              </div>
            </div>
          </div>
        )}

        <div ref={containerRef} className="flex-1 bg-muted/30 overflow-hidden relative">
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/10 border-4 border-dashed border-primary z-10 flex items-center justify-center pointer-events-none">
              <div className="bg-background/90 px-6 py-4 rounded-lg shadow-lg">
                <p className="text-lg font-semibold text-foreground">Drop images here</p>
              </div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onWheel={handleWheel}
            className="w-full h-full cursor-default touch-none"
          />
          {/* GLB Selection Overlays */}
          {layers.filter(layer => layer.type === 'glb' && layer.visible && selectedLayerIds.includes(layer.id)).map(layer => {
            const baseLeft = pan.x + layer.x * zoom
            const baseTop = pan.y + layer.y * zoom
            const width = layer.width * zoom
            const height = layer.height * zoom
            const handleSize = 8

            const selectionStyle: React.CSSProperties = {
              position: 'absolute',
              left: `${baseLeft}px`,
              top: `${baseTop}px`,
              width: `${width}px`,
              height: `${height}px`,
              transform: `translate(${dragDelta.x}px, ${dragDelta.y}px)`,
              pointerEvents: 'auto',
              border: '2px solid #6366f1',
              boxSizing: 'border-box',
              cursor: 'move',
            }

            const handles = [
              { type: 'nw', x: 0, y: 0, cursor: 'nw-resize' },
              { type: 'n', x: width / 2, y: 0, cursor: 'n-resize' },
              { type: 'ne', x: width, y: 0, cursor: 'ne-resize' },
              { type: 'e', x: width, y: height / 2, cursor: 'e-resize' },
              { type: 'se', x: width, y: height, cursor: 'se-resize' },
              { type: 's', x: width / 2, y: height, cursor: 's-resize' },
              { type: 'sw', x: 0, y: height, cursor: 'sw-resize' },
              { type: 'w', x: 0, y: height / 2, cursor: 'w-resize' },
            ]

            return (
              <div key={`selection-${layer.id}`}>
                <div
                  style={selectionStyle}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setSelectedLayerIds([layer.id])
                    setIsDragging(true)
                    const canvasRect = canvasRef.current?.getBoundingClientRect()
                    if (canvasRect) {
                      const screenX = e.clientX - canvasRect.left
                      const screenY = e.clientY - canvasRect.top
                      const canvasX = (screenX - pan.x) / zoom
                      const canvasY = (screenY - pan.y) / zoom
                      setDragStart({ x: canvasX, y: canvasY })
                      setInitialDragPositions({ [layer.id]: { x: layer.x, y: layer.y } })
                    }
                  }}
                  onDragStart={(e) => e.preventDefault()}
                />
                {handles.map(h => (
                  <div
                    key={`handle-${layer.id}-${h.type}`}
                    style={{
                      position: 'absolute',
                      left: `${baseLeft + h.x}px`,
                      top: `${baseTop + h.y}px`,
                      width: `${handleSize}px`,
                      height: `${handleSize}px`,
                      background: 'white',
                      border: '2px solid #6366f1',
                      transform: 'translate(-50%, -50%)',
                      cursor: h.cursor,
                      pointerEvents: 'auto',
                      zIndex: 3,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setIsResizing(true)
                      setActiveHandle(h.type as Handle)
                      setInitialLayerState({ ...layer })
                      const canvasRect = canvasRef.current?.getBoundingClientRect()
                      if (canvasRect) {
                        const screenX = e.clientX - canvasRect.left
                        const screenY = e.clientY - canvasRect.top
                        setDragStart({ x: screenX, y: screenY })
                      }
                    }}
                    onDragStart={(e) => e.preventDefault()}
                  />
                ))}
              </div>
            )
          })}
          {layers.length === 0 && !isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <MousePointer2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">Click "Add Media" or drag and drop media here</p>
                <p className="text-muted-foreground text-xs mt-2">
                  Scroll to zoom • Shift+drag to pan • Alt+drag to duplicate • Ctrl+Click to multi-select
                </p>
              </div>
            </div>
          )}
        </div>

        {showLayerPanel && (
           <div className="w-80 border-l border-border bg-card flex flex-col">
             {/* Global Configuration */}
              <div className="border rounded-lg bg-muted/30 m-2">
                <button
                  onClick={() => setShowApiConfig(!showApiConfig)}
                  className="w-full p-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <h3 className="text-sm font-medium">Global Configuration</h3>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showApiConfig ? 'rotate-180' : ''}`} />
                </button>

                {showApiConfig && (
                  <div className="px-4 pb-4 space-y-3">
                    {!hostnameContainsTostAi && (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="use-local-api">Use Local API</Label>
                            <div className="flex items-center space-x-2">
                              <Switch
                                id="use-local-api"
                                checked={useLocalApi}
                                onCheckedChange={setUseLocalApi}
                              />
                              <Label htmlFor="use-local-api" className="text-xs">
                                {useLocalApi ? 'Local' : 'TostAI'}
                              </Label>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Toggle between local API and TostAI API
                          </p>
                        </div>
                      </>
                    )}

                    {useLocalApi && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="local-api-url">Local API URL</Label>
                          <Input
                            id="local-api-url"
                            type="url"
                            placeholder="http://localhost:8000"
                            value={localApiUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalApiUrl(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            URL of your local API server for AI services
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="local-upload-url">Local Upload URL</Label>
                          <Input
                            id="local-upload-url"
                            type="url"
                            placeholder="http://localhost:9000"
                            value={localUploadUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalUploadUrl(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            URL of your local MinIO server for file uploads
                          </p>
                        </div>
                      </>
                    )}

                    {!useLocalApi && (
                      <div className="space-y-2">
                        <Label htmlFor="tostai-token">Tost Wallet Code</Label>
                        <Input
                          id="tostai-token"
                          type="password"
                          placeholder="Enter your TostAI API token"
                          value={serviceTostaiToken}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setServiceTostaiToken(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Required for TostAI API authentication
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={checkTokenRemaining}
                            className="text-xs h-8"
                          >
                            <Wallet className="w-3 h-3 mr-1" />
                            Check Wallet
                          </Button>
                          {tokenRemaining !== null && (
                            <span className="text-xs text-green-600 font-medium">
                              Remain: {tokenRemaining}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(process.env.NEXT_PUBLIC_TOST_AI_PURCHASE_URL, '_blank')}
                          className="text-xs w-full"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Purchase TostAI Credits
                        </Button>
                        {hostnameContainsTostAi && (
                          <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(process.env.NEXT_PUBLIC_TOST_AI_GUIDE_URL, '_blank')}
                                className="text-xs w-full"
                              >
                                <Book className="w-4 h-4 mr-2" />
                                Local Installation Guide
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(process.env.NEXT_PUBLIC_TOST_AI_FOLLOW_URL, '_blank')}
                      className="text-xs w-full"
                    >
                      <Earth className="w-4 h-4 mr-2" />
                      Follow TostAI for Updates
                    </Button>

                    <div className="space-y-2">
                      <Label htmlFor="webhook-url">Webhook URL (Optional)</Label>
                      <Input
                        id="webhook-url"
                        type="url"
                        placeholder="https://your-webhook-url.com/callback"
                        value={serviceWebhookUrl}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setServiceWebhookUrl(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Optional webhook for job completion notifications
                      </p>
                    </div>


                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="max-dimension">Max Layer Dimension</Label>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="max-dimension-toggle"
                            checked={maxDimensionEnabled}
                            onCheckedChange={setMaxDimensionEnabled}
                          />
                          <Label htmlFor="max-dimension-toggle" className="text-xs">
                            {maxDimensionEnabled ? 'Enabled' : 'Disabled'}
                          </Label>
                        </div>
                      </div>
                      <Input
                        id="max-dimension"
                        type="number"
                        placeholder="1024"
                        value={maxDimension}
                        disabled={!maxDimensionEnabled}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxDimension(parseInt(e.target.value) || 1024)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum dimension for uploaded layers (pixels)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="ui-scale">UI Scale</Label>
                        <span className="text-xs text-muted-foreground">{uiScale}%</span>
                      </div>
                      <Slider
                        id="ui-scale"
                        value={[uiScale]}
                        onValueChange={(value) => setUiScale(value[0])}
                        min={70}
                        max={140}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Adjust the overall size of UI elements (70% to 140%)
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        localStorage.setItem("tostai_token", serviceTostaiToken)
                        localStorage.setItem("webhook_url", serviceWebhookUrl)
                        localStorage.setItem("max_dimension", maxDimension.toString())
                        localStorage.setItem("use_local_api", useLocalApi.toString())
                        localStorage.setItem("local_api_url", localApiUrl)
                        localStorage.setItem("local_upload_url", localUploadUrl)
                        localStorage.setItem("ui_scale", uiScale.toString())
                        setShowApiConfig(false)
                      }}
                      className="w-full"
                    >
                      Save Settings
                    </Button>
                  </div>
                )}
</div>

{/* Generate Empty Layer */}
<div className="border rounded-lg bg-muted/30 m-2">
  <button
    onClick={() => setShowGenerateEmptyImage(!showGenerateEmptyImage)}
    className="w-full p-4 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
  >
    <div>
      <h3 className="text-sm font-medium">Generate Empty Layer</h3>
      {!selectedServiceId ? (
        <p className="text-xs text-muted-foreground mt-1">Select a service first</p>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">
          Divisor: {(() => {
            const selectedService = aiServices.find(s => s.id === selectedServiceId)
            return selectedService?.divisible || 4
          })()}
        </p>
      )}
    </div>
    <ChevronDown className={`w-4 h-4 transition-transform ${showGenerateEmptyImage ? 'rotate-180' : ''}`} />
  </button>

  {showGenerateEmptyImage && (
    <div className="px-4 pb-4">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => addEmptyImageLayer(1024, 1024, "1:1")}
          disabled={!selectedServiceId}
          className="text-xs"
        >
          1:1 (1024×1024)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => addEmptyImageLayer(1600, 900, "16:9")}
          disabled={!selectedServiceId}
          className="text-xs"
        >
          16:9 (1600×900)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => addEmptyImageLayer(900, 1600, "9:16")}
          disabled={!selectedServiceId}
          className="text-xs"
        >
          9:16 (900×1600)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => addEmptyImageLayer(1600, 800, "2:1")}
          disabled={!selectedServiceId}
          className="text-xs"
        >
          2:1 (1600×800)
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Custom Aspect Ratio</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="custom-aspect-ratio" className="text-xs">Aspect Ratio</Label>
            <Input
              id="custom-aspect-ratio"
              type="text"
              value={customAspectRatio}
              onChange={(e) => setCustomAspectRatio(e.target.value)}
              placeholder="16:9"
              className="text-xs h-8"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-base-size" className="text-xs">Base Size</Label>
            <Input
              id="custom-base-size"
              type="number"
              value={customBaseSize}
              onChange={(e) => setCustomBaseSize(parseInt(e.target.value) || 1024)}
              className="text-xs h-8"
              min="64"
              max="4096"
              step="4"
            />
          </div>
        </div>
        {(() => {
          const { width, height } = calculateDimensionsFromAspectRatio(customAspectRatio, customBaseSize)

          // Use calculated dimensions (max dimension constraint not applied to generated empty images)
          let finalWidth = width
          let finalHeight = height

          // Ensure they are divisible by 4
          finalWidth = Math.ceil(finalWidth / 4) * 4
          finalHeight = Math.ceil(finalHeight / 4) * 4

          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => addEmptyImageLayer(width, height, customAspectRatio)}
              disabled={!selectedServiceId}
              className="w-full text-xs"
            >
              Generate {customAspectRatio} ({Math.round(finalWidth)}×{Math.round(finalHeight)})
            </Button>
          )
        })()}
      </div>
    </div>
  )}
</div>

<div className="flex-1 overflow-y-auto p-2">
              {layers.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No layers yet</div>
              ) : (
                <div className="space-y-1">
                  {[...layers].reverse().map((layer, index) => {
                    const actualIndex = layers.length - 1 - index
                    const isSelected = selectedLayerIds.includes(layer.id)
                    return (
                      <div
                        key={layer.id}
                        draggable
                        onDragStart={(e) => handleLayerDragStart(e, layer.id)}
                        onDragOver={(e) => handleLayerDragOver(e, layer.id)}
                        onDrop={(e) => handleLayerDrop(e, layer.id)}
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            if (selectedLayerIds.includes(layer.id)) {
                              setSelectedLayerIds(selectedLayerIds.filter((id) => id !== layer.id))
                            } else {
                              setSelectedLayerIds([...selectedLayerIds, layer.id])
                            }
                          } else {
                            setSelectedLayerIds([layer.id])
                          }
                          // Auto-show/hide timeline based on selected layer type
                          const updatedSelectedIds = e.ctrlKey || e.metaKey
                            ? (selectedLayerIds.includes(layer.id)
                              ? selectedLayerIds.filter((id) => id !== layer.id)
                              : [...selectedLayerIds, layer.id])
                            : [layer.id]
                          const selectedLayers = layers.filter(l => updatedSelectedIds.includes(l.id))
                          const hasVideoLayer = selectedLayers.length > 0 && selectedLayers.some(l => l.type === 'video')
                          setShowTimelinePanel(hasVideoLayer)
                        }}
                        className={cn(
                          "group flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                          isSelected ? "bg-primary/10 border-primary" : "bg-background border-border hover:bg-muted",
                          dragOverLayerId === layer.id && "border-primary border-2",
                          !layer.visible && "opacity-60",
                        )}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab" />
                        <div className="flex-shrink-0 w-12 h-12 rounded border border-border bg-muted overflow-hidden">
                          {layer.type === 'image' && layer.image ? (
                            <img
                              src={layer.image.src || "/placeholder.svg"}
                              alt={layer.name}
                              className="w-full h-full object-cover"
                            />
                          ) : layer.type === 'text' ? (
                            <div className="w-full h-full flex items-center justify-center text-xs font-medium bg-white text-black">
                              T
                            </div>
                          ) : layer.type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center text-xs font-medium bg-black text-white">
                              <Video className="w-4 h-4" />
                            </div>
                          ) : layer.type === 'glb' ? (
                            <div className="w-full h-full flex items-center justify-center text-xs font-medium bg-blue-100 text-blue-800">
                              <Box className="w-4 h-4" />
                            </div>
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{layer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(layer.width)} × {Math.round(layer.height)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-0.5">
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={(e) => {
                               e.stopPropagation()
                               setLayers(prev => prev.map(l =>
                                 l.id === layer.id ? { ...l, visible: !l.visible } : l
                               ))
                             }}
                             className="h-6 w-6 p-0"
                             title={layer.visible ? "Hide layer" : "Show layer"}
                           >
                             {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                           </Button>
                           {layer.isGlbThumbnail && layer.glbUrl && (
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={(e) => {
                                 e.stopPropagation()
                                 // Show the previously hidden layer if any
                                 if (currentGlbUrl) {
                                   setLayers(prev => prev.map(l => l.glbUrl === currentGlbUrl ? { ...l, visible: true } : l))
                                 }
                                 setCurrentGlbUrl(layer.glbUrl!)
                                 setCurrentGlbTitle(layer.name.replace(' Thumbnail', ''))
                                 // Calculate screen position and size of the thumbnail
                                 const canvasRect = canvasRef.current?.getBoundingClientRect()
                                 if (canvasRect) {
                                   const originalWidth = layer.width * zoom
                                   const originalHeight = layer.height * zoom
                                   const screenWidth = originalWidth * 1.2
                                   const screenHeight = originalHeight * 1.2
                                   const screenX = canvasRect.left + pan.x + layer.x * zoom - (screenWidth - originalWidth) / 2
                                   const screenY = canvasRect.top + pan.y + layer.y * zoom - (screenHeight - originalHeight) / 2
                                   setCurrentGlbPosition({ x: screenX, y: screenY })
                                   setCurrentGlbSize({ width: screenWidth, height: screenHeight })
                                 }
                                 // Hide the thumbnail layer
                                 setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: false } : l))
                                 setSelectedLayerIds([])
                                 setShowGlbViewer(true)
                               }}
                               className="h-6 w-6 p-0"
                               title="Open GLB Preview"
                             >
                               <Box className="w-3 h-3" />
                             </Button>
                           )}
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={(e) => {
                               e.stopPropagation()
                               moveLayerUp(layer.id)
                             }}
                             disabled={actualIndex === layers.length - 1}
                             className="h-6 w-6 p-0"
                             title="Move up"
                           >
                             <ChevronUp className="w-3 h-3" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={(e) => {
                               e.stopPropagation()
                               moveLayerDown(layer.id)
                             }}
                             disabled={actualIndex === 0}
                             className="h-6 w-6 p-0"
                             title="Move down"
                           >
                             <ChevronDown className="w-3 h-3" />
                           </Button>
                         </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {selectedLayerIds.length > 0 && (
              <div className="p-3 border-t border-border bg-muted/30">
                {primarySelectedLayer && (primarySelectedLayer.delayTime !== undefined || primarySelectedLayer.executionTime !== undefined || primarySelectedLayer.resultUrl) && (
                  <div className="space-y-3 mb-3">
                    <p className="text-xs font-medium text-muted-foreground">AI Generation Info</p>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {!useLocalApi && primarySelectedLayer.delayTime !== undefined && (
                        <div>Queue Delay: {(primarySelectedLayer.delayTime / 1000).toFixed(1)}s</div>
                      )}
                      {!useLocalApi && primarySelectedLayer.executionTime !== undefined && (
                        <div>Processing Time: {(primarySelectedLayer.executionTime / 1000).toFixed(1)}s</div>
                      )}
                      {!useLocalApi && primarySelectedLayer.billing && (
                        <>
                          <div>Cost per Second: {primarySelectedLayer.billing.costPerSecond.toFixed(2)}</div>
                          <div>Deducted: {primarySelectedLayer.billing.deducted.toFixed(2)}</div>
                          <div className="text-green-600">Remaining: {primarySelectedLayer.billing.remaining.toFixed(2)}</div>
                        </>
                      )}
                      {primarySelectedLayer.resultUrl && (
                        <div>
                          <span className="font-medium">Result URL:</span>{' '}
                          <a
                            href={primarySelectedLayer.resultUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 underline break-all"
                          >
                            {primarySelectedLayer.resultUrl!}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-xs font-medium text-muted-foreground mb-2">Quick Actions</p>
                {selectedTextLayer && (
                  <div className="space-y-2 mb-3">
                    <Textarea
                      value={selectedTextLayer.text || ''}
                      onChange={(e) => {
                        const newText = e.target.value
                        setLayers(prev => prev.map(l => {
                          if (l.id === selectedTextLayer.id) {
                            const updatedLayer = { ...l, text: newText }
                            return updateTextLayerDimensions(updatedLayer)
                          }
                          return l
                        }))
                      }}
                      placeholder="Enter text"
                      rows={2}
                      className="text-xs"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number"
                        value={selectedTextLayer.fontSize || 24}
                        onChange={(e) => {
                          const fontSize = parseInt(e.target.value) || 24
                          setLayers(prev => prev.map(l => {
                            if (l.id === selectedTextLayer.id) {
                              const updatedLayer = { ...l, fontSize }
                              return updateTextLayerDimensions(updatedLayer)
                            }
                            return l
                          }))
                        }}
                        min="8"
                        max="200"
                        className="text-xs h-8"
                        placeholder="Size"
                      />
                      <Select
                        value={selectedTextLayer.fontFamily || 'Arial'}
                        onValueChange={(fontFamily) => {
                          setLayers(prev => prev.map(l => {
                            if (l.id === selectedTextLayer.id) {
                              const updatedLayer = { ...l, fontFamily }
                              return updateTextLayerDimensions(updatedLayer)
                            }
                            return l
                          }))
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Arial">Arial</SelectItem>
                          <SelectItem value="Helvetica">Helvetica</SelectItem>
                          <SelectItem value="Times New Roman">Times</SelectItem>
                          <SelectItem value="Georgia">Georgia</SelectItem>
                          <SelectItem value="Verdana">Verdana</SelectItem>
                          <SelectItem value="Courier New">Courier</SelectItem>
                          <SelectItem value="Impact">Impact</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="color"
                        value={selectedTextLayer.color || '#000000'}
                        onChange={(e) => {
                          const color = e.target.value
                          setLayers(prev => prev.map(l =>
                            l.id === selectedTextLayer.id
                              ? { ...l, color }
                              : l
                          ))
                        }}
                        className="h-8 w-full"
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeBackground(selectedLayerIds)}
                    disabled={selectedLayerIds.length === 0 || !selectedLayers.some(l => l.type === 'image') || (isBgRemovalProcessing && bgRemovalQueue.length === 0)}
                    className="text-xs col-span-3"
                  >
                    {isBgRemovalProcessing && currentProcessingLayer ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Processing "{currentProcessingLayer}"...
                      </>
                    ) : isBgRemovalProcessing && bgRemovalQueue.length > 0 ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Queued {bgRemovalQueue.length} layer{bgRemovalQueue.length > 1 ? 's' : ''}...
                      </>
                    ) : (() => {
                      const selectedImageLayers = selectedLayers.filter(l => l.type === 'image')
                      return (
                        <>
                          <Scissors className="w-3 h-3 mr-1" />
                          {selectedImageLayers.length > 1 ? 'Remove Backgrounds' : 'Remove Background'}
                        </>
                      )
                    })()}
                  </Button>
                  <div className="col-span-3 text-xs text-muted-foreground mt-2">
                    Background removal may take time and the UI may become unresponsive during processing.
                  </div>
                  {hasTransparency(primarySelectedLayer) && (
                    <div className="col-span-3 flex gap-2">
                      <Input
                        type="color"
                        defaultValue="#ffffff"
                        disabled={selectedLayerIds.length !== 1 || !primarySelectedLayer || primarySelectedLayer.type !== 'image'}
                        className="h-8 w-12 p-0 border-0"
                        title="Background color"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement
                          if (colorInput && primarySelectedLayer && primarySelectedLayer.type === 'image') {
                            const color = colorInput.value
                            // Create a new canvas filled with the selected color
                            const canvas = document.createElement("canvas")
                            canvas.width = primarySelectedLayer.width
                            canvas.height = primarySelectedLayer.height
                            const ctx = canvas.getContext("2d")
                            if (!ctx) return

                            // Fill with the selected color
                            ctx.fillStyle = color
                            ctx.fillRect(0, 0, canvas.width, canvas.height)

                            // Draw the existing image on top
                            if (primarySelectedLayer.image) {
                              ctx.drawImage(primarySelectedLayer.image, 0, 0, primarySelectedLayer.width, primarySelectedLayer.height)
                            }

                            // Convert to image
                            const img = new window.Image()
                            img.onload = () => {
                              setLayers(prev => prev.map(l =>
                                l.id === primarySelectedLayer.id
                                  ? { ...l, image: img }
                                  : l
                              ))
                              setForceRedraw(prev => prev + 1)
                            }
                            img.src = canvas.toDataURL()
                          }
                        }}
                        disabled={selectedLayerIds.length !== 1 || !primarySelectedLayer || primarySelectedLayer.type !== 'image'}
                        className="text-xs flex-1"
                      >
                        <Image className="w-3 h-3 mr-1" />
                        Fill Background
                      </Button>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => moveLayerUp(selectedLayerIds[0])}
                    disabled={selectedLayerIds.length !== 1}
                    className="text-xs"
                  >
                    <ChevronUp className="w-3 h-3 mr-1" />
                    Move Up
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => moveLayerDown(selectedLayerIds[0])}
                    disabled={selectedLayerIds.length !== 1}
                    className="text-xs"
                  >
                    <ChevronDown className="w-3 h-3 mr-1" />
                    Move Down
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deleteSelectedLayer}
                    className="text-xs"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                  {primarySelectedLayer?.isGlbThumbnail && primarySelectedLayer.glbUrl && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const a = document.createElement("a")
                        a.href = primarySelectedLayer.glbUrl!
                        a.download = `${primarySelectedLayer.name.replace(' Thumbnail', '').replace(/\s+/g, '_')}-TostAI-${Date.now()}.glb`
                        a.click()
                      }}
                      disabled={selectedLayerIds.length !== 1}
                      className="text-xs col-span-3 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Export GLB
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => exportLayer(selectedLayerIds[0])}
                    disabled={selectedLayerIds.length !== 1}
                    className="text-xs col-span-3 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Export Layer
                  </Button>
                </div>
              </div>
            )}
            {selectedLayerIds.length > 1 && (
              <div className="p-3 border-t border-border bg-muted/30">
                <p className="text-sm text-center text-muted-foreground">{selectedLayerIds.length} layers selected</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline Panel */}
      {selectedLayers.some(layer => layer.type === 'video') && showTimelinePanel && (
        <div className="h-32 border-t border-border bg-card flex flex-col">
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-4">
              {selectedLayers.filter(layer => layer.type === 'video').map((videoLayer) => (
                <div key={videoLayer.id} className="space-y-2 p-3 bg-muted/50 rounded">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      <span className="text-sm font-medium">{videoLayer.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTimelinePanel(false)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onMouseDown={() => {
                        playVideo(videoLayer.id)
                      }}
                      onMouseUp={() => {
                        pauseVideo(videoLayer.id)
                      }}
                      onMouseLeave={() => {
                        pauseVideo(videoLayer.id)
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        playVideo(videoLayer.id)
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault()
                        pauseVideo(videoLayer.id)
                      }}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Hold to Play
                    </Button>
                    <div className="flex-1">
                      <Slider
                        value={[sliderValues[videoLayer.id] ?? (videoLayer.currentTime || 0)]}
                        max={videoLayer.duration && videoLayer.duration > 0 ? videoLayer.duration : 100}
                        step={0.1}
                        disabled={!videoLayer.duration || videoLayer.duration === 0}
                        onValueChange={(value) => {
                          setSliderValues(prev => ({ ...prev, [videoLayer.id]: value[0] }))
                          seekVideo(videoLayer.id, value[0])
                        }}
                        onValueCommit={(value) => {
                          // Update the slider value to match the video's current time after seeking
                          setSliderValues(prev => ({ ...prev, [videoLayer.id]: videoLayer.currentTime || 0 }))
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation()
                        }}
                        onTouchMove={(e) => {
                          e.stopPropagation()
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation()
                        }}
                        className="w-full"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {Math.floor((videoLayer.currentTime || 0) / 60)}:{Math.floor((videoLayer.currentTime || 0) % 60).toString().padStart(2, '0')} / {Math.floor((videoLayer.duration || 0) / 60)}:{Math.floor((videoLayer.duration || 0) % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* Service Selector Modal */}
      {isClient && showServiceSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div
            className="bg-background rounded-lg shadow-xl overflow-hidden flex flex-col"
            style={{
              width: Math.min(canvasDisplaySize.width * 0.95, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 800),
              height: Math.min(canvasDisplaySize.height * 0.95, typeof window !== 'undefined' ? window.innerHeight * 0.85 : 600),
              maxWidth: '90vw',
              maxHeight: '85vh'
            }}
          >
            <div className="flex-1 overflow-y-auto p-6">
              {serviceSelectorView === "services" ? (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search services..."
                        value={serviceSearchQuery}
                        onChange={(e) => setServiceSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowServiceSelector(false)
                        setServiceSelectorView("services")
                        setSelectedServiceForExamples(null)
                      }}
                      className="h-10 w-10 p-0 flex-shrink-0 hover:opacity-80 bg-[rgb(249,115,22)] text-black dark:bg-[rgb(255,149,0)] dark:text-white"
                    >
                      <X className="h-4 w-4 text-white dark:text-black" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {serviceCategories.map((category) => {
                      const IconComponent = category.id === "all" ? Grid3X3 :
                        category.id === "image" ? ImageIcon :
                        category.id === "video" ? Video :
                        category.id === "3d" ? Box :
                        MessageSquare
                      return (
                        <Button
                          key={category.id}
                          variant={serviceSelectedCategory === category.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setServiceSelectedCategory(category.id)}
                          className="flex items-center gap-2 text-sm font-medium"
                        >
                          <IconComponent className="h-4 w-4" />
                          <span className="hidden sm:inline">{category.name}</span>
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {category.count}
                          </Badge>
                        </Button>
                      )
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredAvailableServices.map((service) => (
                      <Card
                        key={service.id}
                        className="relative cursor-pointer transition-all hover:shadow-md"
                        onClick={() => handleViewExamples(service)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${getCategoryColor(service.category)} flex-shrink-0`}>
                              {(() => {
                                const IconComponent = getServiceIconComponent(service.icon)
                                return <IconComponent className="h-4 w-4" />
                              })()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm mb-1">{service.name}</h4>
                              <p className="text-xs text-muted-foreground line-clamp-2">{service.description}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {service.category.toUpperCase()}
                                </Badge>
                              </div>
                              {service.category === "image" && service.examples?.output && service.examples.output.length > 0 && (
                                <div className="mt-2">
                                  <img
                                    src={service.examples.output[0]}
                                    alt={`${service.name} example output`}
                                    className="w-full aspect-video object-cover rounded border"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none"
                                    }}
                                  />
                                </div>
                              )}
                              {service.category === "video" && service.examples?.output && service.examples.output.length > 0 && (
                                <div className="mt-2">
                                  <video
                                    src={service.examples.output[0]}
                                    className="w-full aspect-video object-cover rounded border"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none"
                                    }}
                                  />
                                </div>
                              )}
                              {service.category === "3d" && service.examples?.input && service.examples.input.length > 0 && (
                                <div className="mt-2">
                                  <img
                                    src={service.examples.input[0]}
                                    alt={`${service.name} example input`}
                                    className="w-full aspect-video object-cover rounded border"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none"
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {!aiServices.some(s => s.id === service.id) && (
                            <div className="absolute top-2 right-2">
                              <Plus className="w-3 h-3 text-gray-300" />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {filteredAvailableServices.length === 0 && (
                    <div className="text-center py-12">
                      <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">No services found</h3>
                      <p className="text-muted-foreground">Try adjusting your search terms or category filter</p>
                    </div>
                  )}
                </div>
              ) : serviceSelectorView === "examples" && selectedServiceForExamples ? (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBackToServices}
                        className="flex items-center gap-2"
                      >
                        <ChevronDown className="h-4 w-4 rotate-90" />
                        Back to Services
                      </Button>
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${getCategoryColor(selectedServiceForExamples.category)}`}>
                          {(() => {
                            const IconComponent = getServiceIconComponent(selectedServiceForExamples.icon)
                            return <IconComponent className="h-4 w-4" />
                          })()}
                        </div>
                        <div>
                          <h3 className="font-semibold">{selectedServiceForExamples.name}</h3>
                          <p className="text-sm text-muted-foreground">{selectedServiceForExamples.description}</p>
                          <div className="flex gap-2 mt-2">
                            {selectedServiceForExamples.codeRepository && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(selectedServiceForExamples.codeRepository, '_blank')}
                                className="text-xs h-7 px-2"
                              >
                                <Github className="w-3 h-3 mr-1" />
                                Code
                              </Button>
                            )}
                            {selectedServiceForExamples.projectPage && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(selectedServiceForExamples.projectPage, '_blank')}
                                className="text-xs h-7 px-2"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Project
                              </Button>
                            )}
                            {selectedServiceForExamples.researchPaper && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(selectedServiceForExamples.researchPaper, '_blank')}
                                className="text-xs h-7 px-2"
                              >
                                <BookOpen className="w-3 h-3 mr-1" />
                                Paper
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!aiServices.some(s => s.id === selectedServiceForExamples.id) && (
                        <Button
                          onClick={() => handleServiceSelect(selectedServiceForExamples)}
                          className="flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add Service
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowServiceSelector(false)
                          setServiceSelectorView("services")
                          setSelectedServiceForExamples(null)
                        }}
                        className="h-10 w-10 p-0 flex-shrink-0 hover:opacity-80 bg-[rgb(249,115,22)] text-black dark:bg-[rgb(255,149,0)] dark:text-white"
                      >
                        <X className="h-4 w-4 text-white dark:text-black" />
                      </Button>
                    </div>
                  </div>

                  <Card>
                    <CardContent>
                      {selectedServiceForExamples && selectedServiceForExamples.examples ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <div className="space-y-6">
                              {selectedServiceForExamples.examples.input.map((path: string, index: number) => {
                                const ext = path.split('.').pop()?.toLowerCase()
                                const fileKey = getTextFileKey(selectedServiceForExamples.id, 'input', path)

                                const getInputLabel = (ext: string | undefined) => {
                                  switch (ext) {
                                    case 'txt': return `Text Input (.${ext})`
                                    case 'png':
                                    case 'jpg':
                                    case 'jpeg':
                                    case 'webp': return `Image Input (.${ext})`
                                    case 'mp3':
                                    case 'wav':
                                    case 'flac': return `Audio Input (.${ext})`
                                    case 'mp4':
                                    case 'avi':
                                    case 'mov': return `Video Input (.${ext})`
                                    case 'glb':
                                    case 'gltf':
                                    case 'obj': return `3D Model Input (.${ext})`
                                    default: return ext ? `File Input (.${ext})` : 'File Input'
                                  }
                                }

                                return (
                                  <div key={index} className="rounded-lg p-4 bg-muted/50">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-sm">{getInputLabel(ext)}</span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(path, '_blank')}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    {ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? (
                                      <img
                                        src={path}
                                        alt={`Input ${index + 1}`}
                                        className="max-w-full h-auto rounded"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none"
                                        }}
                                      />
                                    ) : ext === 'mp3' || ext === 'wav' ? (
                                      <audio controls src={path} className="w-full" />
                                    ) : ext === 'mp4' ? (
                                      <video controls src={path} className="max-w-full h-auto rounded" />
                                    ) : ext === 'glb' || ext === 'gltf' ? (
                                      <ModelViewer
                                        src={path}
                                        alt={`Input ${index + 1}`}
                                        camera-controls
                                        auto-rotate
                                        debug
                                        style={{ width: "100%", height: "600px" }}
                                      >
                                        <div slot="progress-bar"></div>
                                      </ModelViewer>
                                    ) : ext === 'txt' ? (
                                      <div className="bg-background rounded p-3 max-h-40 overflow-y-auto">
                                        <pre className="text-xs whitespace-pre-wrap font-mono">
                                          {textFileContents[fileKey] || 'Loading...'}
                                        </pre>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground">
                                        {path}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <div className="space-y-6">
                              {selectedServiceForExamples.examples.output.map((path: string, index: number) => {
                                const ext = path.split('.').pop()?.toLowerCase()
                                const fileKey = getTextFileKey(selectedServiceForExamples.id, 'output', path)

                                const getOutputLabel = (ext: string | undefined) => {
                                  switch (ext) {
                                    case 'txt': return `Text Output (.${ext})`
                                    case 'png':
                                    case 'jpg':
                                    case 'jpeg':
                                    case 'webp': return `Image Output (.${ext})`
                                    case 'mp3':
                                    case 'wav':
                                    case 'flac': return `Audio Output (.${ext})`
                                    case 'mp4':
                                    case 'avi':
                                    case 'mov': return `Video Output (.${ext})`
                                    case 'glb':
                                    case 'gltf':
                                    case 'obj': return `3D Model Output (.${ext})`
                                    case 'ply': return `Point Cloud Output (.${ext})`
                                    case 'fbx': return `FBX Output (.${ext})`
                                    default: return ext ? `File Output (.${ext})` : 'File Output'
                                  }
                                }

                                return (
                                  <div key={index} className="rounded-lg p-4 bg-muted/50">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium text-sm">{getOutputLabel(ext)}</span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(path, '_blank')}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    {ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? (
                                      <img
                                        src={path}
                                        alt={`Output ${index + 1}`}
                                        className="max-w-full h-auto rounded"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none"
                                        }}
                                      />
                                    ) : ext === 'mp3' || ext === 'wav' ? (
                                      <audio controls src={path} className="w-full" />
                                    ) : ext === 'mp4' ? (
                                      <video controls src={path} className="max-w-full h-auto rounded" />
                                    ) : ext === 'glb' || ext === 'gltf' ? (
                                      <ModelViewer
                                        src={path}
                                        alt={`Output ${index + 1}`}
                                        camera-controls
                                        auto-rotate
                                        style={{ width: "100%", height: "600px" }}
                                      />
                                    ) : ext === 'txt' ? (
                                      <div className="bg-background rounded p-3 max-h-40 overflow-y-auto">
                                        <pre className="text-xs whitespace-pre-wrap font-mono">
                                          {textFileContents[fileKey] || 'Loading...'}
                                        </pre>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-muted-foreground">
                                        {path}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="text-lg font-semibold mb-2">No Examples Available</h3>
                          <p className="text-muted-foreground">Examples for this service are not available yet</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* GLB Viewer Window */}
      {showGlbViewer && currentGlbUrl && (
        <GLBViewerWindow
          glbUrl={currentGlbUrl!}
          title={currentGlbTitle}
          initialPosition={currentGlbPosition}
          initialSize={currentGlbSize}
          onClose={() => {
            // Show the thumbnail layer again
            if (currentGlbUrl) {
              setLayers(prev => prev.map(l => l.glbUrl === currentGlbUrl ? { ...l, visible: true } : l))
            }
            setShowGlbViewer(false)
            setCurrentGlbUrl(null)
            setCurrentGlbTitle("")
            setCurrentGlbPosition({ x: 100, y: 100 })
            setCurrentGlbSize({ width: 600, height: 500 })
          }}
        />
      )}
    </div>
  )
}
