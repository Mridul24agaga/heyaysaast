"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/utitls/supabase/client"
import {
  Menu,
  CreditCard,
  FileText,
  Lightbulb,
  Users,
  ArrowRight,
  Check,
  BarChart2,
  Sparkles,
  Target,
} from "lucide-react"
import { Sidebar } from "@/app/components/sidebar"
import Link from "next/link"
import { PaymentPage } from "@/app/components/PaymentPage"

interface DashboardShellProps {
  user: User
}

interface Subscription {
  plan_id: string
  credits: number
  status?: string
  current_period_end?: string
  onboarding_completed?: boolean
}

export function DashboardShell({ user }: DashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [showPaymentPage, setShowPaymentPage] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [completionStatus, setCompletionStatus] = useState({
    contentIdeas: false,
    blogSettings: false,
    audienceKeywords: false,
  })
  const [stats, setStats] = useState({
    postsCreated: 3,
    ideasGenerated: 12,
    creditsUsed: 0,
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Define the plan credits map consistently with the first code
  const planCreditsMap: { [key: string]: number } = {
    "trial": 2,
    "basic": 10, // Adjusted from your "starter" to match your naming
    "pro": 30,
    "professional": 30, // Assuming this matches your "pro" tier
  }

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true)
      } else {
        setIsSidebarOpen(false)
      }
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      await setupRealtimeSubscription()
      await checkOnboardingStatus()
      setIsLoading(false)
    }

    const userId = searchParams.get("user_id")
    const plan = searchParams.get("plan")
    const credits = searchParams.get("credits")

    if (userId && plan && credits) {
      handlePaymentSuccess(userId, plan, Number.parseInt(credits))
    } else {
      fetchData()
    }
  }, [searchParams])

  const setupRealtimeSubscription = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        console.error("Failed to get user for real-time subscription:", error)
        return
      }

      const userId = user.id

      // Initial fetch of subscription
      const { data: subscriptionData, error: fetchError } = await supabase
        .from("subscriptions")
        .select("plan_id, credits, status, current_period_end, onboarding_completed")
        .eq("user_id", userId)
        .single()

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          console.log("No subscription found for user")
          setShowPaymentPage(true)
        } else {
          console.error("Error fetching subscription:", fetchError.message, fetchError.details)
        }
        return
      }

      if (subscriptionData) {
        const planId = subscriptionData.plan_id.toLowerCase()
        const maxPosts = planCreditsMap[planId] || 0

        // Reset credits if they don't match the plan's max or are null
        if (subscriptionData.credits === null || subscriptionData.credits !== maxPosts) {
          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({ credits: maxPosts })
            .eq("user_id", userId)
          if (updateError) {
            console.error("Failed to reset credits:", updateError)
          } else {
            subscriptionData.credits = maxPosts
          }
        }

        setSubscription(subscriptionData)
        setStats((prev) => ({
          ...prev,
          creditsUsed: maxPosts - (subscriptionData.credits || 0),
        }))
        setShowPaymentPage(false)
      }

      // Set up real-time subscription
      const subscriptionChannel = supabase
        .channel('subscriptions-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'subscriptions',
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            console.log('Subscription change detected:', payload)
            const updatedSubscription = payload.new as Subscription
            const planId = updatedSubscription.plan_id.toLowerCase()
            const maxPosts = planCreditsMap[planId] || 0

            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const shouldResetCredits =
                payload.eventType === 'INSERT' ||
                (payload.old && payload.old.plan_id !== updatedSubscription.plan_id) ||
                updatedSubscription.credits !== maxPosts

              if (shouldResetCredits) {
                console.log(`Resetting credits to ${maxPosts} for plan ${planId}`)
                const { error: updateError } = await supabase
                  .from("subscriptions")
                  .update({ credits: maxPosts })
                  .eq("user_id", userId)
                if (updateError) {
                  console.error("Failed to reset credits:", updateError)
                } else {
                  updatedSubscription.credits = maxPosts
                }
              }
            }

            setSubscription(updatedSubscription)
            setStats((prev) => ({
              ...prev,
              creditsUsed: maxPosts - (updatedSubscription.credits || 0),
            }))
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(subscriptionChannel)
      }
    } catch (err) {
      console.error("Unexpected error while setting up subscription:", err)
    }
  }

  const checkOnboardingStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .single()

      if (error) {
        console.error("Error checking onboarding status:", error.message)
        return
      }

      if (data && data.onboarding_completed) {
        setCompletionStatus({
          contentIdeas: true,
          blogSettings: true,
          audienceKeywords: true,
        })
      }
    } catch (err) {
      console.error("Error checking onboarding status:", err)
    }
  }

  const handlePaymentSuccess = async (userId: string, plan: string, credits: number) => {
    try {
      const subscriptionData = {
        user_id: userId,
        plan_id: plan,
        credits: credits,
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }

      const { error } = await supabase.from("subscriptions").upsert(subscriptionData)

      if (error) throw error

      await setupRealtimeSubscription()
      router.replace("/dashboard")
    } catch (error) {
      console.error("Error updating subscription after payment:", error)
    }
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await supabase.auth.signOut()
      router.refresh()
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    } finally {
      setIsSigningOut(false)
    }
  }

  const markStepAsCompleted = async (step: keyof typeof completionStatus) => {
    try {
      setCompletionStatus((prev) => ({
        ...prev,
        [step]: true,
      }))

      const updatedStatus = {
        ...completionStatus,
        [step]: true,
      }

      if (Object.values(updatedStatus).every(Boolean)) {
        const { error } = await supabase
          .from("subscriptions")
          .update({ onboarding_completed: true })
          .eq("user_id", user.id)

        if (error) {
          console.error("Error marking onboarding as completed:", error.message)
        }
      }
    } catch (error) {
      console.error(`Error marking ${step} as completed:`, error)
    }
  }

  const markAllAsCompleted = async () => {
    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id)

      if (error) {
        console.error("Error marking onboarding as completed:", error.message)
        return
      }

      setCompletionStatus({
        contentIdeas: true,
        blogSettings: true,
        audienceKeywords: true,
      })

      setShowOnboarding(false)
    } catch (error) {
      console.error("Error marking onboarding as completed:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (showPaymentPage) {
    return <PaymentPage />
  }

  const totalCredits = subscription ? planCreditsMap[subscription.plan_id.toLowerCase()] || 0 : 0
  const creditsRemaining = subscription?.credits || 0
  const creditsUsagePercentage = totalCredits ? ((totalCredits - creditsRemaining) / totalCredits) * 100 : 0

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 h-screen bg-white border-r border-gray-200 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-200 ease-in-out lg:translate-x-0`}
      >
        <Sidebar subscription={subscription} />
      </div>

      <div className="flex flex-col flex-1 w-full lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden text-gray-500 hover:text-gray-700 mr-3"
                aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                <Menu size={24} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800">Dashboard</h2>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-sm p-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
                    Welcome to Blogosocial <Sparkles className="h-6 w-6" />
                  </h1>
                  <p className="text-orange-100 text-lg">
                    Your AI-powered content creation platform is ready to help you create amazing content.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Posts Created</h3>
                  <FileText className="h-4 w-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold">{stats.postsCreated}</div>
                <p className="text-xs text-gray-500">Blog posts generated this month</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Ideas Generated</h3>
                  <Lightbulb className="h-4 w-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold">{stats.ideasGenerated}</div>
                <p className="text-xs text-gray-500">Content ideas created this month</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Credits Used</h3>
                  <BarChart2 className="h-4 w-4 text-gray-400" />
                </div>
                <div className="text-2xl font-bold">{stats.creditsUsed}</div>
                <p className="text-xs text-gray-500">Credits used this month</p>
              </div>
            </div>

            {subscription && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">Your Subscription</h2>
                  <Link href="/upgrade">
                    <button className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center">
                      <CreditCard className="mr-2 h-4 w-4" />
                      Upgrade Plan
                    </button>
                  </Link>
                </div>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Plan</p>
                      <p className="text-2xl font-bold">
                        {subscription.plan_id.charAt(0).toUpperCase() + subscription.plan_id.slice(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Status</p>
                      <p className="text-2xl font-bold capitalize">{subscription.status || "Active"}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-500">Credits Remaining</p>
                      <p className="text-sm font-medium">
                        {creditsRemaining} / {totalCredits} credits
                      </p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${creditsUsagePercentage}%` }}
                      ></div>
                    </div>
                  </div>
                  {subscription.current_period_end && (
                    <p className="text-sm text-gray-500">
                      Renews on {new Date(subscription.current_period_end).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Quick Actions</h2>
              <p className="text-sm text-gray-500 mb-4">Get started with these common tasks</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Link href="/dashboard/summarizer">
                  <button className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="flex items-center">
                      <Target className="mr-2 h-4 w-4 text-gray-500" />
                      <span>Create New Content</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </button>
                </Link>
                <Link href="/company-database/ideas">
                  <button className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="flex items-center">
                      <Lightbulb className="mr-2 h-4 w-4 text-gray-500" />
                      <span>Generate Ideas</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </button>
                </Link>
              </div>
            </div>

            {!subscription?.onboarding_completed && (
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">Setup Progress</h2>
                </div>
                <div className="px-6 py-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-700">Completion Status</span>
                    <span className="text-sm font-medium text-gray-700">
                      {Object.values(completionStatus).filter(Boolean).length} of 3 completed
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
                    <div
                      className="bg-orange-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${(Object.values(completionStatus).filter(Boolean).length / 3) * 100}%` }}
                    ></div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              completionStatus.contentIdeas ? "bg-green-100" : "bg-orange-100"
                            }`}
                          >
                            {completionStatus.contentIdeas ? (
                              <Check className="w-5 h-5 text-green-500" />
                            ) : (
                              <Lightbulb className="w-5 h-5 text-orange-500" />
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <h3 className="text-lg font-medium text-gray-900">Content Ideas</h3>
                          <p className="text-sm text-gray-500">Set up your content idea sources and preferences</p>
                        </div>
                      </div>
                      <Link
                        href="/company-database/ideas"
                        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
                          completionStatus.contentIdeas
                            ? "text-gray-700 bg-gray-200 hover:bg-gray-300"
                            : "text-white bg-orange-500 hover:bg-orange-600"
                        }`}
                      >
                        {completionStatus.contentIdeas ? "Edit Settings" : "Complete Setup"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              completionStatus.blogSettings ? "bg-green-100" : "bg-orange-100"
                            }`}
                          >
                            {completionStatus.blogSettings ? (
                              <Check className="w-5 h-5 text-green-500" />
                            ) : (
                              <FileText className="w-5 h-5 text-orange-500" />
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <h3 className="text-lg font-medium text-gray-900">Blog Settings</h3>
                          <p className="text-sm text-gray-500">
                            Configure your blog preferences and publishing strategy
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/company-database/blog"
                        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
                          completionStatus.blogSettings
                            ? "text-gray-700 bg-gray-200 hover:bg-gray-300"
                            : "text-white bg-orange-500 hover:bg-orange-600"
                        }`}
                      >
                        {completionStatus.blogSettings ? "Edit Settings" : "Complete Setup"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              completionStatus.audienceKeywords ? "bg-green-100" : "bg-orange-100"
                            }`}
                          >
                            {completionStatus.audienceKeywords ? (
                              <Check className="w-5 h-5 text-green-500" />
                            ) : (
                              <Users className="w-5 h-5 text-orange-500" />
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <h3 className="text-lg font-medium text-gray-900">Audience and Keywords</h3>
                          <p className="text-sm text-gray-500">Define your target audience and important keywords</p>
                        </div>
                      </div>
                      <Link
                        href="/settings"
                        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
                          completionStatus.audienceKeywords
                            ? "text-gray-700 bg-gray-200 hover:bg-gray-300"
                            : "text-white bg-orange-500 hover:bg-orange-600"
                        }`}
                      >
                        {completionStatus.audienceKeywords ? "Edit Settings" : "Complete Setup"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </div>
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={markAllAsCompleted}
                        className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                      >
                        Mark All Steps as Completed
                        <Check className="ml-2 h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}