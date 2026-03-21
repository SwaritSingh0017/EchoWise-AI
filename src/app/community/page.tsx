'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Heart, Reply, User, Send, Loader, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import {
    getAllPosts,
    createPost,
    createReply,
    likePost,
    getUserByEmail,
    getRepliesForPost
} from '@/utils/db/actions'

type Post = {
    id: number
    userId: number
    userName: string
    content: string
    createdAt: string | Date
    likes: number
    replies?: ReplyType[]
}

type ReplyType = {
    id: number
    userId: number
    userName: string
    content: string
    createdAt: string | Date
    parentId?: number
    replies?: ReplyType[]
}

export default function CommunityPage() {
    const [posts, setPosts] = useState<Post[]>([])
    const [loading, setLoading] = useState(true)
    const [newPostContent, setNewPostContent] = useState('')
    const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
    const [replyingTo, setReplyingTo] = useState<number | null>(null)
    const [replyContent, setReplyContent] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            try {
                const userEmail = localStorage.getItem('userEmail')
                if (userEmail) {
                    const dbUser = await getUserByEmail(userEmail)
                    if (dbUser) setUser(dbUser)
                }
                const dbPosts = await getAllPosts()

                // Fetch replies for each post
                const postsWithReplies = await Promise.all(dbPosts.map(async (post: any) => {
                    const replies = await getRepliesForPost(post.id)
                    return { ...post, replies }
                }))

                setPosts(postsWithReplies as Post[])
            } catch (error) {
                toast.error('Failed to load posts.')
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [])

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) { toast.error('Please log in.'); return }
        if (!newPostContent.trim()) return
        setIsSubmitting(true)
        try {
            const post = await createPost(user.id, newPostContent)
            if (post) {
                setPosts([{ ...post, userName: user.name, likes: 0, replies: [] }, ...posts])
                setNewPostContent('')
                toast.success('Post created!')
            }
        } catch {
            toast.error('Failed to create post.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleLike = async (postId: number) => {
        if (!user) { toast.error('Please log in.'); return }
        try {
            const result = await likePost(postId, user.id)
            if (result) {
                setPosts(posts.map(p => 
                    p.id === postId 
                    ? { ...p, likes: result.liked ? p.likes + 1 : Math.max(0, p.likes - 1) } 
                    : p
                ))
            }

        } catch {
            toast.error('Failed to like post.')
        }
    }

    const handleCreateReply = async (postId: number, parentReplyId?: number) => {
        if (!user) { toast.error('Please log in.'); return }
        if (!replyContent.trim()) return
        setIsSubmitting(true)
        try {
            const reply = await createReply(postId, user.id, replyContent, parentReplyId)
            if (reply) {
                // Deep update: find the right place to insert the reply
                const updatePostsDeep = (postsList: Post[]): Post[] => {
                    return postsList.map(p => {
                        if (p.id !== postId) return p;

                        const newReplyObj = { ...reply, userName: user.name, replies: [] };

                        if (!parentReplyId) {
                            return { ...p, replies: [...(p.replies || []), newReplyObj] };
                        }

                        const insertReplyDeep = (replies: ReplyType[]): ReplyType[] => {
                            return replies.map(r => {
                                if (r.id === parentReplyId) {
                                    return { ...r, replies: [...(r.replies || []), newReplyObj] };
                                }
                                if (r.replies && r.replies.length > 0) {
                                    return { ...r, replies: insertReplyDeep(r.replies) };
                                }
                                return r;
                            });
                        };

                        return { ...p, replies: insertReplyDeep(p.replies || []) };
                    });
                };

                setPosts(updatePostsDeep(posts));
                setReplyContent('')
                setReplyingTo(null)
                toast.success('Reply added!')
            }
        } catch {
            toast.error('Failed to add reply.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const renderReplies = (replies: ReplyType[], postId: number, depth = 0) => {
        if (!replies || replies.length === 0) return null;
        return (
            <div className={`mt-3 space-y-3 ${depth > 0 ? 'ml-4 border-l-2 border-gray-100 pl-4' : 'pl-6 border-l-2 border-gray-50'}`}>
                {replies.map(reply => (
                    <div key={reply.id} className="group">
                        <div className="bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-[11px] text-gray-700">{reply.userName}</p>
                                <p className="text-[10px] text-gray-400">{new Date(reply.createdAt).toLocaleDateString()}</p>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{reply.content}</p>
                            <button
                                onClick={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                                className="text-[10px] text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Reply className="h-3 w-3" /> Reply
                            </button>
                        </div>

                        {replyingTo === reply.id && (
                            <div className="mt-2 flex gap-2 ml-2">
                                <Input
                                    value={replyContent}
                                    onChange={(e) => setReplyContent(e.target.value)}
                                    placeholder="Writer a reply..."
                                    className="flex-1 h-8 text-xs"
                                    autoFocus
                                />
                                <Button onClick={() => handleCreateReply(postId, reply.id)} disabled={isSubmitting || !replyContent.trim()} size="sm" className="h-8 bg-blue-600 hover:bg-blue-700">
                                    <Send className="h-3 w-3" />
                                </Button>
                            </div>
                        )}

                        {reply.replies && renderReplies(reply.replies, postId, depth + 1)}
                    </div>
                ))}
            </div>
        );
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
            <Loader className="animate-spin h-8 w-8 text-green-500" />
        </div>
    )

    return (
        <div className="p-4 md:p-8 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <MessageSquare className="h-8 w-8 text-green-600" />
                <h1 className="text-3xl font-bold text-gray-800">Community Hub</h1>
            </div>

            <form onSubmit={handleCreatePost} className="bg-white p-6 rounded-2xl shadow-lg mb-8 border border-green-100">
                <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Share your waste collection journey or tips..."
                    className="w-full p-4 border border-gray-100 rounded-xl focus:ring-2 focus:ring-green-500 mb-4 bg-gray-50 resize-none transition-all"
                    rows={3}
                />
                <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting || !newPostContent.trim()} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-xl transition-all shadow-md hover:shadow-lg">
                        {isSubmitting ? <Loader className="animate-spin h-4 w-4" /> : 'Post to Community'}
                    </Button>
                </div>
            </form>

            <div className="space-y-8">
                {posts.map(post => (
                    <div key={post.id} className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 hover:border-green-200 transition-all">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-inner">
                                <User className="h-7 w-7 text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-lg">{post.userName}</p>
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                    {new Date(post.createdAt).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <p className="text-gray-700 mb-6 text-base leading-relaxed whitespace-pre-wrap">{post.content}</p>

                        <div className="flex items-center gap-6 border-t pt-4">
                            <button onClick={() => handleLike(post.id)} className="flex items-center gap-2 text-gray-500 hover:text-red-500 transition-all group">
                                <div className={`p-2 rounded-full group-hover:bg-red-50 ${post.likes > 0 ? 'bg-red-50' : ''}`}>
                                    <Heart className={`h-5 w-5 ${post.likes > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                                </div>
                                <span className={`text-sm font-semibold ${post.likes > 0 ? 'text-red-500' : ''}`}>{post.likes}</span>
                            </button>
                            <button onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-all group">
                                <div className={`p-2 rounded-full group-hover:bg-blue-50`}>
                                    <MessageCircle className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-semibold">{post.replies?.length || 0}</span>
                            </button>
                        </div>

                        {replyingTo === post.id && (
                            <div className="mt-4 pt-4 border-t border-gray-50">
                                <div className="flex gap-2">
                                    <Input
                                        value={replyContent}
                                        onChange={(e) => setReplyContent(e.target.value)}
                                        placeholder="Write a reply..."
                                        className="flex-1 rounded-xl"
                                        autoFocus
                                    />
                                    <Button onClick={() => handleCreateReply(post.id)} disabled={isSubmitting || !replyContent.trim()} className="bg-blue-600 hover:bg-blue-700 rounded-xl px-4">
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {renderReplies(post.replies || [], post.id)}
                    </div>
                ))}
            </div>
        </div>
    )
}
