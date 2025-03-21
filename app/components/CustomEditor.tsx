"use client"

import type React from "react"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  ArrowLeft,
  Share2,
  List,
  BookOpen,
  BarChart2,
  Plus,
  ImageIcon,
  X,
  Loader2,
  AlertCircle,
  Bold,
  Italic,
  Underline,
  Link,
  ListOrdered,
  ExternalLink,
  Sparkles,
  Code,
  Undo,
  Redo,
  Save,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utitls/supabase/client"

// Initialize Supabase client
const supabase = createClient()

// Formatting utility (optimized)
const formatUtils = {
  convertMarkdownToHtml: (markdown: string): string => {
    let html = markdown
      .replace(/^###### (.*$)/gim, '<h6 class="text-lg font-semibold mt-6 mb-3">$1</h6>')
      .replace(/^##### (.*$)/gim, '<h5 class="text-xl font-semibold mt-6 mb-3">$1</h5>')
      .replace(/^#### (.*$)/gim, '<h4 class="text-2xl font-semibold mt-8 mb-4">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3 class="text-3xl font-bold mt-10 mb-5 text-gray-800">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-4xl font-bold mt-12 mb-6 text-gray-900">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-5xl font-bold mt-14 mb-8 text-gray-900 border-b pb-4">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em class="italic font-normal">$1</em>')
      .replace(/^- (.*)$/gim, '<li class="ml-6 mb-4 list-disc text-gray-700 font-normal">$1</li>')
      .replace(/^[*] (.*)$/gim, '<li class="ml-6 mb-4 list-disc text-gray-700 font-normal">$1</li>')
      .replace(/(<li.*?>.*<\/li>)/gim, '<ul class="my-6">$1</ul>')
      .replace(/\n{2,}/g, '</p><p class="mt-6 mb-6 text-gray-700 leading-relaxed font-normal">')
      .replace(/\[([^\]]+)\]$$([^)]+)$$/gim, (match, text, url) => {
        // Check if the URL is internal (relative) or external
        const isExternal = url.startsWith("http") || url.startsWith("https")
        if (isExternal) {
          return `<a href="${url}" class="text-orange-600 underline hover:text-orange-700 font-normal" target="_blank" rel="noopener noreferrer">${text}</a>`
        } else {
          // Internal link
          return `<a href="${url}" class="text-blue-600 hover:text-blue-800 font-normal">${text}</a>`
        }
      })
      .replace(
        /^>\s+(.*)$/gim,
        '<blockquote class="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-6 font-normal">$1</blockquote>',
      )

    html = `<p class="mt-6 mb-6 text-gray-700 leading-relaxed font-normal">${html}</p>`
    return html
  },

  sanitizeHtml: (html: string): string => {
    if (!html) return ""

    if (html.includes("<script") || html.includes("javascript:") || html.includes("onerror=")) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, "text/html")

      doc.querySelectorAll("p, li, a, blockquote").forEach((el) => {
        el.classList.remove("font-bold")
        el.classList.add("font-normal")
      })
      doc.querySelectorAll("p").forEach((p) => {
        p.classList.add("mt-6", "mb-6", "text-gray-700", "leading-relaxed")
      })
      doc.querySelectorAll("ul").forEach((ul) => {
        ul.classList.add("my-6")
      })
      doc.querySelectorAll("li").forEach((li) => {
        li.classList.add("ml-6", "mb-4", "list-disc", "text-gray-700", "font-normal")
      })
      doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
        h.classList.remove("font-normal")
        h.classList.add("font-bold")

        if (h.tagName === "H1") {
          h.classList.add("text-5xl", "mt-14", "mb-8", "text-gray-900", "border-b", "pb-4")
        } else if (h.tagName === "H2") {
          h.classList.add("text-4xl", "mt-12", "mb-6", "text-gray-900")
        } else if (h.tagName === "H3") {
          h.classList.add("text-3xl", "mt-10", "mb-5", "text-gray-800")
        } else if (h.tagName === "H4") {
          h.classList.add("text-2xl", "mt-8", "mb-4")
        } else if (h.tagName === "H5") {
          h.classList.add("text-xl", "mt-6", "mb-3")
        } else if (h.tagName === "H6") {
          h.classList.add("text-lg", "mt-6", "mb-3")
        }

        if (!h.textContent?.trim()) {
          h.innerHTML = "<br>"
        }
      })

      return doc.body.innerHTML
    }

    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/onerror=/gi, "")
  },

  generateToc: (htmlContent: string): Array<{ id: string; text: string; level: number }> => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, "text/html")
    const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6")
    return Array.from(headings).map((h, i) => {
      h.id = `heading-${i}`
      return {
        id: `heading-${i}`,
        text: h.textContent?.trim() || "",
        level: Number(h.tagName[1]),
      }
    })
  },
}

interface CustomEditorProps {
  initialValue: string
  onChange: (newContent: string) => void
  images: string[]
  onGenerateMore: () => void
  citations: string[]
  postId: string // Added postId prop for Supabase updates
}

// Context Menu Component
const ContextMenu: React.FC<{
  visible: boolean
  position: { x: number; y: number }
  onClose: () => void
  onDelete: () => void
}> = ({ visible, position, onClose, onDelete }) => {
  if (!visible) return null

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const menu = document.querySelector(".fixed.z-50")
      if (menu && !menu.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200"
      style={{ top: `${position.y}px`, left: `${position.x}px`, minWidth: "160px" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="py-1">
        <button
          className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100 flex items-center"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete()
            onClose()
          }}
        >
          <X className="w-4 h-4 mr-2" />
          Delete Image
        </button>
      </div>
    </div>
  )
}

// FloatingToolbar
const FloatingToolbar: React.FC<{
  visible: boolean
  position: { x: number; y: number }
  onCommand: (command: string, value?: string) => void
}> = ({ visible, position, onCommand }) => {
  if (!visible) return null

  return (
    <div
      className="absolute z-50 bg-gray-900 text-white rounded-lg shadow-lg flex items-center p-1.5 gap-1"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
        transform: "translate(-50%, -120%)",
        opacity: visible ? 1 : 0,
      }}
    >
      <button
        onClick={() => onCommand("generateImage")}
        className="p-1.5 hover:bg-gray-700 rounded-md flex items-center gap-1 text-xs"
        title="Generate Image"
      >
        <ImageIcon className="h-4 w-4" />
      </button>
      <div className="h-5 border-r border-gray-700 mx-1"></div>
      <button onClick={() => onCommand("bold")} className="p-1.5 hover:bg-gray-700 rounded-md" title="Bold">
        <Bold className="h-4 w-4" />
      </button>
      <button onClick={() => onCommand("italic")} className="p-1.5 hover:bg-gray-700 rounded-md" title="Italic">
        <Italic className="h-4 w-4" />
      </button>
      <button onClick={() => onCommand("underline")} className="p-1.5 hover:bg-gray-700 rounded-md" title="Underline">
        <Underline className="h-4 w-4" />
      </button>
      <button
        onClick={() => {
          const url = prompt("Enter URL:", "https://")
          if (url && url.trim()) onCommand("createLink", url.trim())
        }}
        className="p-1.5 hover:bg-gray-700 rounded-md"
        title="Insert Link"
      >
        <Link className="h-4 w-4" />
      </button>
      <button
        onClick={() => onCommand("removeFormat")}
        className="p-1.5 hover:bg-gray-700 rounded-md"
        title="Clear Formatting"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ImageGenerationModal
const ImageGenerationModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onInsertImage: (imageUrl: string) => void
  blogContent: string
}> = ({ isOpen, onClose, onInsertImage, blogContent }) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aspectRatio] = useState<string>("16:9")

  const determineImageCount = (content: string): number => {
    const words = content
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length
    return words > 1000 ? 5 : words > 500 ? 4 : 3
  }

  const generatePromptsFromContent = (content: string, count: number): string[] => {
    const headingMatches = content.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) || []
    const headings = headingMatches.map((h) => h.replace(/<\/?[^>]+(>|$)/g, "").trim())
    const paragraphs = content.split("</p>").filter((p) => p.trim().length > 0)
    const prompts: string[] = []

    const extractKeyTopics = (text: string): string => {
      const plainText = text.replace(/<[^>]+>/g, "").trim()
      const contextText = plainText.slice(0, Math.min(plainText.length, 150))
      return contextText.split(/[,.;:]/).filter((s) => s.trim().length > 15)[0] || contextText
    }

    for (let i = 0; i < count && i < paragraphs.length; i++) {
      let paragraphIndex = i
      while (paragraphIndex < paragraphs.length) {
        const paragraph = paragraphs[paragraphIndex].replace(/<[^>]+>/g, "").trim()
        if (paragraph.length >= 50) break
        paragraphIndex++
      }
      if (paragraphIndex >= paragraphs.length) paragraphIndex = i

      const paragraph = paragraphs[paragraphIndex].replace(/<[^>]+>/g, "").trim()
      let nearestHeading = ""
      for (let j = 0; j < headingMatches.length; j++) {
        const headingPos = content.indexOf(headingMatches[j])
        const paragraphPos = content.indexOf(paragraphs[paragraphIndex])
        if (headingPos < paragraphPos) nearestHeading = headings[j]
        else break
      }

      const keyTopic = extractKeyTopics(paragraph)
      if (paragraph) {
        let prompt = `Create a professional 16:9 photograph that precisely illustrates "${keyTopic}"`
        if (nearestHeading) prompt += ` in the context of "${nearestHeading}"`
        prompt += `. The image should show ${paragraph.slice(0, 100)}... Style: high-quality, realistic photography with natural lighting, professional composition.`
        prompts.push(prompt)
      }
    }

    while (prompts.length < count) {
      if (headings.length > 0) {
        const headingIndex = prompts.length % headings.length
        prompts.push(
          `Create a professional 16:9 photograph that precisely illustrates "${headings[headingIndex]}". Style: high-quality, realistic photography with natural lighting, professional composition.`,
        )
      } else {
        prompts.push(
          `Create a professional 16:9 photograph related to ${content
            .replace(/<[^>]+>/g, "")
            .split(" ")
            .slice(0, 10)
            .join(" ")}... Style: high-quality, realistic photography with natural lighting, professional composition.`,
        )
      }
    }
    return prompts.slice(0, count)
  }

  const handleGenerate = async () => {
    if (!blogContent.trim()) {
      setError("No blog content available to generate images.")
      return
    }
    setIsGenerating(true)
    setError(null)
    setGeneratedImages([])
    setSelectedImage(null)

    try {
      const imageCount = determineImageCount(blogContent)
      const prompts = generatePromptsFromContent(blogContent, imageCount)
      const imagePromises = prompts.map((prompt) =>
        fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, aspect_ratio: aspectRatio }),
        }).then((res) => res.json()),
      )
      const results = await Promise.all(imagePromises)
      const images = results.flatMap((data) => data.images || [])
      if (!images.length) throw new Error("No images generated")
      setGeneratedImages(images)
      setSelectedImage(images[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate images.")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleInsert = () => {
    if (selectedImage) {
      onInsertImage(selectedImage)
      onClose()
      setGeneratedImages([])
      setSelectedImage(null)
      setError(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center">
            <ImageIcon className="h-5 w-5 mr-2 text-orange-600" />
            Generate Images
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 flex-1 overflow-auto">
          <p className="text-sm text-gray-600 mb-3">
            Generating {determineImageCount(blogContent)} images based on your content.
          </p>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full mt-4 px-4 py-2.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 flex items-center justify-center"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Images
              </>
            )}
          </button>
          {error && (
            <div className="mt-2 p-3 bg-red-50 text-red-700 rounded-md flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {isGenerating && (
            <div className="mt-6 flex flex-col items-center py-8">
              <Loader2 className="h-10 w-10 text-orange-600 animate-spin mb-4" />
              <p className="text-gray-600">Generating images...</p>
            </div>
          )}
          {generatedImages.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-3">Generated Images</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {generatedImages.map((img, index) => (
                  <div
                    key={index}
                    className={`relative rounded-lg overflow-hidden border-2 cursor-pointer ${
                      selectedImage === img ? "border-orange-500" : "border-transparent hover:border-orange-300"
                    }`}
                    onClick={() => setSelectedImage(img)}
                  >
                    <img
                      src={img || "/placeholder.svg"}
                      alt={`Generated image ${index + 1}`}
                      className="w-full aspect-video object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!selectedImage}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400"
          >
            Insert Image
          </button>
        </div>
      </div>
    </div>
  )
}

// Basic Editor Component (Fixed)
const BasicEditor: React.FC<{
  value: string
  onChange: (value: string) => void
  className?: string
  postId: string // Added postId prop
}> = ({ value, onChange, className, postId }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const [showToolbar, setShowToolbar] = useState(false)
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 })
  const selectionTimeout = useRef<NodeJS.Timeout | null>(null)
  const [showImageModal, setShowImageModal] = useState(false)
  const lastSelectionRef = useRef<Range | null>(null)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const contextMenuTarget = useRef<HTMLImageElement | null>(null)
  const isComposingRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [hasPostId, setHasPostId] = useState(!!postId)
  const [isPostIdInitialized, setIsPostIdInitialized] = useState(false)

  // Initialize editor only once on mount
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value.startsWith("<")
        ? formatUtils.sanitizeHtml(value)
        : formatUtils.convertMarkdownToHtml(value)
    }
  }, []) // Empty dependency array to run only on mount

  // Sync external value changes while preserving cursor
  useEffect(() => {
    if (!editorRef.current) return
    const currentContent = editorRef.current.innerHTML
    const newContent = value.startsWith("<")
      ? formatUtils.sanitizeHtml(value)
      : formatUtils.convertMarkdownToHtml(value)

    if (currentContent !== newContent) {
      const selection = window.getSelection()
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

      editorRef.current.innerHTML = newContent

      if (range && editorRef.current.contains(range.startContainer)) {
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }, [value])

  // Set up Supabase realtime subscription
  useEffect(() => {
    let channel: any = null

    // Only proceed if postId is available and not yet initialized
    if (postId && !isPostIdInitialized) {
      setHasPostId(true)
      setIsPostIdInitialized(true) // Mark postId as initialized

      // Subscribe to changes on the posts table for this specific post
      channel = supabase
        .channel(`post-${postId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "posts",
            filter: `id=eq.${postId}`,
          },
          (payload) => {
            // Only update if the content is different from our current state
            // and we're not the ones who made the change
            if (payload.new && payload.new.content !== value && !isSaving) {
              const newContent = payload.new.content
              if (editorRef.current) {
                editorRef.current.innerHTML = newContent.startsWith("<")
                  ? formatUtils.sanitizeHtml(newContent)
                  : formatUtils.convertMarkdownToHtml(newContent)
                onChange(newContent)
              }
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setIsSubscribed(true)
          }
        })
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      setIsSubscribed(false)
    }
  }, [postId, value, onChange, isSaving, isPostIdInitialized])

  // Save content to Supabase with debounce
  const saveContent = useCallback(
    async (content: string) => {
      if (!postId || !content) return

      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Set a new timeout to save after 500ms of inactivity
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          setIsSaving(true)
          setSaveStatus("saving")

          const { error } = await supabase
            .from("posts")
            .update({ content, updated_at: new Date().toISOString() })
            .eq("id", postId)

          if (error) throw error
          setSaveStatus("saved")

          // Reset to idle after 2 seconds
          setTimeout(() => {
            setSaveStatus("idle")
          }, 2000)
        } catch (err) {
          console.error("Error saving content:", err)
          setSaveStatus("error")
        } finally {
          setIsSaving(false)
        }
      }, 500)
    },
    [postId],
  )

  // Selection change for toolbar
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (
        selection &&
        !selection.isCollapsed &&
        selection.rangeCount > 0 &&
        editorRef.current?.contains(selection.anchorNode)
      ) {
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        if (rect.width > 0) {
          setToolbarPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 + window.scrollY })
          setShowToolbar(true)
        }
      } else {
        if (selectionTimeout.current) clearTimeout(selectionTimeout.current)
        selectionTimeout.current = setTimeout(() => setShowToolbar(false), 200)
      }
    }
    document.addEventListener("selectionchange", handleSelectionChange)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      if (selectionTimeout.current) clearTimeout(selectionTimeout.current)
    }
  }, [])

  // Handle context menu for images
  useEffect(() => {
    if (!editorRef.current) return
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "IMG" && editorRef.current?.contains(target)) {
        e.preventDefault()
        setContextMenuPosition({ x: e.clientX, y: e.clientY })
        contextMenuTarget.current = target as HTMLImageElement
        setShowContextMenu(true)
      } else if (showContextMenu) {
        setShowContextMenu(false)
      }
    }
    editorRef.current.addEventListener("contextmenu", handleContextMenu)
    return () => editorRef.current?.removeEventListener("contextmenu", handleContextMenu)
  }, [showContextMenu])

  // Execute editor commands
  const execCommand = useCallback(
    (command: string, value?: string) => {
      // First, focus the editor if it's not already focused
      if (document.activeElement !== editorRef.current) {
        editorRef.current?.focus()
      }

      // Special handling for certain commands
      if (command === "generateImage") {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) lastSelectionRef.current = selection.getRangeAt(0).cloneRange()
        setShowImageModal(true)
        return
      }

      if (command === "code") {
        // Handle code blocks more explicitly
        document.execCommand("formatBlock", false, "pre")
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const pre = range.startContainer.parentElement?.closest("pre")
          if (pre) {
            pre.className = "bg-gray-100 p-2 rounded-md font-mono text-sm my-4"
          }
        }
      } else if (command === "createLink" && value) {
        document.execCommand(command, false, value)
        // Apply styling to the newly created link
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const linkNode = range.startContainer.parentElement?.closest("a")
          if (linkNode) {
            // Check if it's an external link
            const isExternal = value.startsWith("http") || value.startsWith("https")
            if (isExternal) {
              linkNode.className = "text-orange-600 underline hover:text-orange-700 font-normal"
              linkNode.target = "_blank"
              linkNode.rel = "noopener noreferrer"
            } else {
              // Internal link
              linkNode.className = "text-blue-600 hover:text-blue-800 font-normal"
            }
          }
        }
      } else {
        // Standard command execution
        document.execCommand(command, false, value)
      }

      // Update content and save changes
      if (editorRef.current) {
        const newContent = editorRef.current.innerHTML
        onChange(newContent)
        saveContent(newContent)
      }
    },
    [onChange, saveContent],
  )

  // Handle image deletion
  const handleDeleteImage = useCallback(() => {
    if (contextMenuTarget.current && editorRef.current) {
      const elementToRemove = contextMenuTarget.current.closest(".image-wrapper") || contextMenuTarget.current
      elementToRemove?.remove()
      const newContent = editorRef.current.innerHTML
      onChange(newContent)
      saveContent(newContent)
      setShowContextMenu(false)
    }
  }, [onChange, saveContent])

  // Handle image insertion
  const handleInsertImage = useCallback(
    (imageUrl: string) => {
      if (lastSelectionRef.current && editorRef.current) {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(lastSelectionRef.current)

        const imgWrapper = document.createElement("div")
        imgWrapper.className = "image-wrapper my-4"
        const img = document.createElement("img")
        img.src = imageUrl
        img.alt = "Generated image"
        img.className = "rounded-lg w-full h-auto shadow-md aspect-video object-cover"
        imgWrapper.appendChild(img)

        const range = lastSelectionRef.current
        range.deleteContents()
        range.insertNode(imgWrapper)

        const newContent = editorRef.current.innerHTML
        onChange(newContent)
        saveContent(newContent)
        setShowImageModal(false)
      }
    },
    [onChange, saveContent],
  )

  // Handle input events
  const handleInput = useCallback(() => {
    if (editorRef.current && !isComposingRef.current) {
      const selection = window.getSelection()
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      const newContent = editorRef.current.innerHTML
      onChange(newContent)
      saveContent(newContent)
      if (range && editorRef.current.contains(range.startContainer)) {
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    }
  }, [onChange, saveContent])

  // Handle composition (e.g., IME input)
  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = () => {
    isComposingRef.current = false
    handleInput()
  }

  // Handle keydown (e.g., Enter, Backspace)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle special key combinations for formatting
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "b":
            e.preventDefault()
            execCommand("bold")
            return
          case "i":
            e.preventDefault()
            execCommand("italic")
            return
          case "u":
            e.preventDefault()
            execCommand("underline")
            return
          case "k":
            e.preventDefault()
            const url = prompt("Enter URL:", "https://")
            if (url && url.trim()) execCommand("createLink", url.trim())
            return
          case "z":
            e.preventDefault()
            execCommand("undo")
            return
          case "y":
            e.preventDefault()
            execCommand("redo")
            return
        }
      }

      // Original Enter key handling for headings
      if (e.key === "Enter") {
        const selection = window.getSelection()
        if (!selection || !selection.rangeCount) return
        const range = selection.getRangeAt(0)
        let currentNode: Node | null = range.startContainer

        while (currentNode && !["H1", "H2", "H3", "H4", "H5", "H6"].includes(currentNode.nodeName)) {
          currentNode = currentNode.nodeType === 3 ? currentNode.parentNode : currentNode.parentElement
          if (!currentNode) break
        }

        if (currentNode && currentNode.parentNode) {
          e.preventDefault()
          const p = document.createElement("p")
          p.className = "mt-6 mb-6 text-gray-700 leading-relaxed font-normal"
          p.innerHTML = "<br>"
          if (currentNode.nextSibling) {
            currentNode.parentNode.insertBefore(p, currentNode.nextSibling)
          } else {
            currentNode.parentNode.appendChild(p)
          }
          const newRange = document.createRange()
          newRange.setStart(p, 0)
          newRange.collapse(true)
          selection.removeAllRanges()
          selection.addRange(newRange)
          if (editorRef.current) {
            const newContent = editorRef.current.innerHTML
            onChange(newContent)
            saveContent(newContent)
          }
        }
      }
    },
    [onChange, saveContent, execCommand],
  )

  // Handle paste
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData.getData("text/plain")
      document.execCommand("insertText", false, text)
      if (editorRef.current) {
        const newContent = editorRef.current.innerHTML
        onChange(newContent)
        saveContent(newContent)
      }
    },
    [onChange, saveContent],
  )

  return (
    <div className="relative bg-white">
      <FloatingToolbar visible={showToolbar} position={toolbarPosition} onCommand={execCommand} />
      <ImageGenerationModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        onInsertImage={handleInsertImage}
        blogContent={value}
      />
      <ContextMenu
        visible={showContextMenu}
        position={contextMenuPosition}
        onClose={() => setShowContextMenu(false)}
        onDelete={handleDeleteImage}
      />
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3">
          <select
            onChange={(e) => execCommand("formatBlock", e.target.value)}
            className="px-3 py-1.5 border rounded-md bg-white text-sm min-w-[100px]"
          >
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="h5">Heading 5</option>
            <option value="h6">Heading 6</option>
          </select>
          <button onClick={() => execCommand("bold")} className="p-1.5 hover:bg-gray-200 rounded" title="Bold">
            <Bold className="w-4 h-4" />
          </button>
          <button onClick={() => execCommand("italic")} className="p-1.5 hover:bg-gray-200 rounded" title="Italic">
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => execCommand("underline")}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            onClick={() => execCommand("insertOrderedList")}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Ordered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            onClick={() => execCommand("insertUnorderedList")}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Unordered List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => execCommand("generateImage")}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Insert Image"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const url = prompt("Enter URL:", "https://")
              if (url && url.trim()) execCommand("createLink", url.trim())
            }}
            className="p-1.5 hover:bg-gray-200 rounded"
            title="Insert Link"
          >
            <Link className="w-4 h-4" />
          </button>
          <button onClick={() => execCommand("code")} className="p-1.5 hover:bg-gray-200 rounded" title="Code Block">
            <Code className="w-4 h-4" />
          </button>
          <button onClick={() => execCommand("undo")} className="p-1.5 hover:bg-gray-200 rounded" title="Undo">
            <Undo className="w-4 h-4" />
          </button>
          <button onClick={() => execCommand("redo")} className="p-1.5 hover:bg-gray-200 rounded" title="Redo">
            <Redo className="w-4 h-4" />
          </button>
          <div className="ml-auto flex items-center">
            {saveStatus === "saving" && (
              <div className="flex items-center text-gray-500 text-xs">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Saving...
              </div>
            )}
            {saveStatus === "saved" && (
              <div className="flex items-center text-green-600 text-xs">
                <Save className="w-3 h-3 mr-1" />
                Saved
              </div>
            )}
            {saveStatus === "error" && (
              <div className="flex items-center text-red-600 text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Error saving
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        className={`p-4 sm:p-6 md:p-8 min-h-[500px] focus:outline-none prose prose-lg max-w-none ${className}`}
        style={{ backgroundColor: "white" }}
      />
      <style jsx global>{`
        .prose img {
          border-radius: 0.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          aspect-ratio: 16/9;
          object-fit: cover;
          width: 100%;
        }
        [contenteditable] {
          outline: none;
        }
        
        /* Formatting styles */
        [contenteditable] h1 {
          font-size: 2.5rem;
          font-weight: bold;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        [contenteditable] h2 {
          font-size: 2rem;
          font-weight: bold;
          margin-top: 1.4rem;
          margin-bottom: 0.8rem;
        }
        [contenteditable] h3 {
          font-size: 1.75rem;
          font-weight: bold;
          margin-top: 1.3rem;
          margin-bottom: 0.7rem;
        }
        [contenteditable] h4 {
          font-size: 1.5rem;
          font-weight: bold;
          margin-top: 1.2rem;
          margin-bottom: 0.6rem;
        }
        [contenteditable] h5 {
          font-size: 1.25rem;
          font-weight: bold;
          margin-top: 1.1rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] h6 {
          font-size: 1.1rem;
          font-weight: bold;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] pre {
          background-color: #f3f4f6;
          padding: 0.75rem;
          border-radius: 0.375rem;
          font-family: monospace;
          font-size: 0.875rem;
          margin: 1rem 0;
          white-space: pre-wrap;
        }
        [contenteditable] ul {
          list-style-type: disc;
          margin: 1rem 0;
          padding-left: 2rem;
        }
        [contenteditable] ol {
          list-style-type: decimal;
          margin: 1rem 0;
          padding-left: 2rem;
        }
        [contenteditable] li {
          margin-bottom: 0.5rem;
        }
        [contenteditable] a {
          color: #ea580c; /* orange-600 */
          text-decoration: underline;
        }
        [contenteditable] a:hover {
          color: #c2410c; /* orange-700 */
        }
        [contenteditable] strong {
          font-weight: bold;
        }
        [contenteditable] em {
          font-style: italic;
        }
        [contenteditable] u {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}

// Main CustomEditor Component
export default function CustomEditor({
  initialValue,
  onChange,
  images,
  onGenerateMore,
  citations,
  postId,
}: CustomEditorProps) {
  const [content, setContent] = useState(initialValue)
  const [toc, setToc] = useState<{ id: string; text: string; level: number }[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const formattedContent = initialValue.startsWith("<")
      ? formatUtils.sanitizeHtml(initialValue)
      : formatUtils.convertMarkdownToHtml(initialValue)
    setContent(formattedContent)
    setToc(formatUtils.generateToc(formattedContent))
  }, [initialValue])

  const handleContentChange = useCallback(
    (value: string) => {
      const sanitizedContent = formatUtils.sanitizeHtml(value)
      setContent(sanitizedContent)
      onChange(sanitizedContent)
      setToc(formatUtils.generateToc(sanitizedContent))
    },
    [onChange],
  )

  const metrics = useMemo(
    () => ({
      words: content
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length,
      headings: toc.length,
      paragraphs: (content.match(/<p[^>]*>/g) || []).length,
      readingTime: Math.ceil(
        content
          .replace(/<[^>]+>/g, " ")
          .split(/\s+/)
          .filter(Boolean).length / 200,
      ),
      images: (content.match(/<img[^>]+>/g) || []).length,
    }),
    [content, toc],
  )

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2 text-gray-600">
              <span>Content Editor</span>
              <span>/</span>
              <span className="text-gray-900 font-medium">Intermittent fasting</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700">Publish</button>
            <button
              className="sm:hidden p-2 hover:bg-gray-100 rounded-full"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <BarChart2 className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-screen-2xl mx-auto flex flex-col md:flex-row">
        <div className="flex-1">
          <BasicEditor value={content} onChange={handleContentChange} className="w-full h-full" postId={postId} />
        </div>
        <div
          className={`md:w-80 flex-shrink-0 border-l border-gray-200 ${isSidebarOpen ? "block" : "hidden md:block"}`}
        >
          <div className="p-4">
            <h3 className="font-medium mb-3">Content Brief</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Words</span>
                  <span className="text-sm font-medium">{metrics.words}</span>
                </div>
                <div className="text-xs text-gray-500">2,000-2,404</div>
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Headings</span>
                  <span className="text-sm font-medium">{metrics.headings}</span>
                </div>
                <div className="text-xs text-gray-500">5-36</div>
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Paragraphs</span>
                  <span className="text-sm font-medium">{metrics.paragraphs}</span>
                </div>
                <div className="text-xs text-gray-500">65-117</div>
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Images</span>
                  <span className="text-sm font-medium">{metrics.images}</span>
                </div>
                <div className="text-xs text-gray-500">3-29</div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200"></div>
          <div className="p-4">
            <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
              <List className="h-4 w-4 mr-2 text-orange-600" />
              Table of Contents
            </h2>
            <div className="max-h-[240px] overflow-y-auto">
              {toc.length > 0 ? (
                <ul className="space-y-1.5">
                  {toc.map((item) => (
                    <li key={item.id} className={`text-sm ${item.level > 1 ? `ml-${(item.level - 1) * 3}` : ""}`}>
                      <a href={`#${item.id}`} className="text-orange-600 hover:underline">
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 italic">No headings found</p>
              )}
            </div>
          </div>
          {citations.length > 0 && (
            <>
              <div className="border-t border-gray-200"></div>
              <div className="p-4">
                <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
                  <BookOpen className="h-4 w-4 mr-2 text-orange-600" />
                  References
                </h2>
                <ul className="space-y-2">
                  {citations.map((citation, index) => (
                    <li key={index} className="text-sm">
                      <a
                        href={citation}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:underline flex items-center gap-1"
                      >
                        <span>{citation}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {images.length > 0 && (
            <>
              <div className="border-t border-gray-200"></div>
              <div className="p-4">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Images</h2>
                <div className="space-y-3">
                  {images.map((src, index) => (
                    <img
                      key={index}
                      src={src || "/placeholder.svg"}
                      alt={`Image ${index + 1}`}
                      className="w-full rounded-md shadow-sm border"
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="border-t border-gray-200"></div>
          <div className="p-4">
            <button
              onClick={onGenerateMore}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg py-3 flex items-center justify-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Generate More Content
            </button>
          </div>
        </div>
      </main>
      <style jsx global>{`
        .prose h1 {
          font-size: 2.5rem;
          margin-top: 3rem;
          margin-bottom: 2rem;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.5rem;
        }
        .prose h2 {
          font-size: 2rem;
          margin-top: 2.5rem;
          margin-bottom: 1.5rem;
        }
        .prose p {
          margin-top: 1.5rem;
          margin-bottom: 1.5rem;
          line-height: 1.75;
        }
        [contenteditable] a {
          color: #ea580c; /* orange-600 */
          text-decoration: underline;
        }
        [contenteditable] a:hover {
          color: #c2410c; /* orange-700 */
        }
      `}</style>
    </div>
  )
}

