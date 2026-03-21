'use client'

import { useState, useEffect } from 'react'
import { User, MapPin, Coins, FileText, Trash2, MessageSquare, Edit2, Save, X, Loader, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUserByEmail, updateUserProfile, getUserStats, getReportsByUserId, getPostsByUserId } from '@/utils/db/actions'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

const WASTE_OPTIONS = ['plastic', 'organic', 'metal', 'mixed']

export default function ProfilePage() {
    const router = useRouter()
    const [user, setUser] = useState<any>(null)
    const [stats, setStats] = useState({ reportCount: 0, collectCount: 0, postCount: 0, tokenBalance: 0 })
    const [recentReports, setRecentReports] = useState<any[]>([])
    const [userPosts, setUserPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState<'reports' | 'posts'>('reports')

    const [form, setForm] = useState({
        name: '',
        bio: '',
        locationText: '',
        wastePreferences: [] as string[],
    })

    useEffect(() => {
        const load = async () => {
            const email = localStorage.getItem('userEmail')
            if (!email) { router.push('/'); return }
            const dbUser = await getUserByEmail(email)
            if (!dbUser) { router.push('/'); return }
            setUser(dbUser)
            setForm({
                name: dbUser.name || '',
                bio: dbUser.bio || '',
                locationText: dbUser.locationText || '',
                wastePreferences: dbUser.wastePreferences ? dbUser.wastePreferences.split(',').filter(Boolean) : [],
            })
            const userStats = await getUserStats(dbUser.id)
            setStats(userStats)

            const [reports, posts] = await Promise.all([
                getReportsByUserId(dbUser.id),
                getPostsByUserId(dbUser.id)
            ])

            setRecentReports(reports.slice(0, 10))
            setUserPosts(posts)
            setLoading(false)
        }
        load()
    }, [router])

    const toggleWastePref = (pref: string) => {
        setForm(prev => ({
            ...prev,
            wastePreferences: prev.wastePreferences.includes(pref)
                ? prev.wastePreferences.filter(w => w !== pref)
                : [...prev.wastePreferences, pref]
        }))
    }

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        try {
            const updated = await updateUserProfile(user.id, {
                name: form.name,
                bio: form.bio,
                locationText: form.locationText,
                wastePreferences: form.wastePreferences.join(','),
            })
            if (updated) {
                setUser(updated)
                setEditing(false)
                toast.success('Profile updated!')
            }
        } catch {
            toast.error('Failed to update profile.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="flex justify-center items-center h-screen">
            <Loader className="animate-spin h-8 w-8 text-green-500" />
        </div>
    )

    const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
                <div className="h-32 bg-gradient-to-r from-green-400 to-emerald-600" />
                <div className="px-6 pb-6">
                    <div className="flex justify-between items-end -mt-12 mb-4">
                        <div className="relative">
                            <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                                {user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-bold text-green-600">{initials}</span>
                                )}
                            </div>
                        </div>
                        <div>
                            {!editing ? (
                                <Button onClick={() => setEditing(true)} variant="outline" size="sm" className="flex items-center gap-2">
                                    <Edit2 className="h-4 w-4" /> Edit Profile
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button onClick={handleSave} disabled={saving} size="sm" className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                                        {saving ? <Loader className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} Save
                                    </Button>
                                    <Button onClick={() => setEditing(false)} variant="outline" size="sm">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {!editing ? (
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">{user?.name}</h1>
                            {user?.bio && <p className="text-gray-600 mt-1">{user.bio}</p>}
                            {user?.locationText && (
                                <div className="flex items-center text-gray-500 mt-2 text-sm">
                                    <MapPin className="h-4 w-4 mr-1 text-green-500" />
                                    {user.locationText}
                                </div>
                            )}
                            {user?.email && (
                                <p className="text-gray-400 text-sm mt-1">{user.email}</p>
                            )}
                            {form.wastePreferences.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {form.wastePreferences.map(pref => (
                                        <span key={pref} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium capitalize">
                                            {pref}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    value={form.name}
                                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                                <textarea
                                    value={form.bio}
                                    onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Tell the community about yourself..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                                <input
                                    value={form.locationText}
                                    onChange={e => setForm(p => ({ ...p, locationText: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="e.g. Balasore, Odisha"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Waste Collection Preferences</label>
                                <div className="flex flex-wrap gap-2">
                                    {WASTE_OPTIONS.map(opt => (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() => toggleWastePref(opt)}
                                            className={`px-3 py-1 rounded-full text-sm font-medium capitalize transition-colors ${form.wastePreferences.includes(opt)
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon={<Coins className="h-6 w-6 text-yellow-500" />} label="Tokens" value={stats.tokenBalance} color="yellow" />
                <StatCard icon={<FileText className="h-6 w-6 text-blue-500" />} label="Reports" value={stats.reportCount} color="blue" />
                <StatCard icon={<Trash2 className="h-6 w-6 text-green-500" />} label="Collected" value={stats.collectCount} color="green" />
                <StatCard icon={<MessageSquare className="h-6 w-6 text-purple-500" />} label="Posts" value={stats.postCount} color="purple" />
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex gap-4 border-b mb-6">
          <button 
            onClick={() => setActiveTab('reports')}
            className={`pb-2 px-1 font-medium transition-colors relative ${activeTab === 'reports' ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Recent Reports
            {activeTab === 'reports' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600" />}
          </button>
          <button 
            onClick={() => setActiveTab('posts')}
            className={`pb-2 px-1 font-medium transition-colors relative ${activeTab === 'posts' ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Community Posts
            {activeTab === 'posts' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600" />}
          </button>
        </div>

        {activeTab === 'reports' ? (
          recentReports.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No reports yet. Start by reporting waste near you!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map(report => (
                <div key={report.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm capitalize">{report.wasteType}</p>
                    <p className="text-xs text-gray-500 flex items-center mt-1">
                      <MapPin className="h-3 w-3 mr-1 text-green-500" />
                      {report.location.length > 50 ? report.location.slice(0, 50) + '...' : report.location}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                      report.status === 'verified' ? 'bg-green-100 text-green-700' :
                      report.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      report.status === 'expired' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {report.status}
                    </span>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          userPosts.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-200 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No posts yet. Share your thoughts in the community!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {userPosts.map(post => (
                <div key={post.id} className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <p className="text-gray-700 text-sm mb-3 line-clamp-3">{post.content}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {post.likesCount}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {post.repliesCount}</span>
                    <span className="ml-auto">{new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
        </div>
    )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
    return (
        <div className="bg-white rounded-xl shadow-md p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-${color}-50`}>{icon}</div>
            <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
            </div>
        </div>
    )
}