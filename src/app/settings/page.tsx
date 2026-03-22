'use client'
import { useState, useEffect } from 'react'
import { User, Mail, Phone, MapPin, Save, Loader, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUserByEmail, updateUserProfile } from '@/utils/db/actions'
import { toast } from 'react-hot-toast'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  const [settings, setSettings] = useState({
    name: '',
    email: '',
    phone: '',
    locationText: '',
    bio: '',
  })

  useEffect(() => {
    const fetchUser = async () => {
      const email = localStorage.getItem('userEmail')
      if (email) {
        const dbUser = await getUserByEmail(email)
        if (dbUser) {
          setUser(dbUser)
          setSettings({
            name: dbUser.name || '',
            email: dbUser.email || '',
            phone: dbUser.phone || '',
            locationText: dbUser.locationText || '',
            bio: dbUser.bio || '',
          })
        }
      }
      setIsLoading(false)
    }
    fetchUser()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setSettings(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSaving(true)
    try {
      await updateUserProfile(user.id, settings)
      toast.success('Settings updated successfully!')
    } catch (error) {
      console.error('Error updating settings:', error)
      toast.error('Failed to update settings.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin h-8 w-8 text-green-500" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2 text-gray-800">Account Settings</h1>
      <p className="text-gray-600 mb-8">Update your profile information and preferences.</p>
      
      <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-2xl shadow-lg space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <div className="relative">
              <input
                type="text"
                id="name"
                name="name"
                value={settings.name}
                onChange={handleInputChange}
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                placeholder="Your name"
              />
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <input
                type="email"
                id="email"
                name="email"
                value={settings.email}
                onChange={handleInputChange}
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                placeholder="your@email.com"
                readOnly
              />
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <div className="relative">
              <input
                type="tel"
                id="phone"
                name="phone"
                value={settings.phone}
                onChange={handleInputChange}
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                placeholder="+1 (555) 000-0000"
              />
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>

          <div>
            <label htmlFor="locationText" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <div className="relative">
              <input
                type="text"
                id="locationText"
                name="locationText"
                value={settings.locationText}
                onChange={handleInputChange}
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                placeholder="City, Country"
              />
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <div className="relative">
            <textarea
              id="bio"
              name="bio"
              rows={4}
              value={settings.bio}
              onChange={handleInputChange}
              className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              placeholder="Tell us a bit about yourself..."
            />
            <FileText className="absolute left-3 top-3 text-gray-400" size={18} />
          </div>
        </div>

        <Button 
          type="submit" 
          className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-medium transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader className="animate-spin w-5 h-5" />
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </form>
    </div>
  )
}