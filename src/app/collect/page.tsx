'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, MapPin, CheckCircle, Clock, Weight, Calendar, Search, Loader, Camera, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import {
  getWasteCollectionTasks,
  updateTaskStatus,
  getUserByEmail,
  upsertCollectorLocation,
  verifyAndCompleteCollection,
} from '@/utils/db/actions'

async function computeImageHash(base64Image: string): Promise<string> {
  const data = base64Image.split(",")[1] || base64Image;
  const buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const WASTE_FILTER_OPTIONS = [
  { label: 'All', value: '' },
  { label: '♻ Plastic', value: 'plastic' },
  { label: '🌿 Organic', value: 'organic' },
  { label: '🔩 Metal', value: 'metal' },
  { label: '🗑 Mixed', value: 'mixed' },
  { label: '⚠️ Hazardous', value: 'hazard' },
  { label: '📟 E-Waste', value: 'e-waste' },
  { label: '📄 Paper', value: 'paper' },
  { label: '🍷 Glass', value: 'glass' },
]

type CollectionTask = {
  id: number
  location: string
  latitude: number | null
  longitude: number | null
  wasteType: string
  amount: string
  status: 'pending' | 'in_progress' | 'completed' | 'verified' | 'expired'
  date: string
  collectorId: number | null
  imageHash: string | null
  reporterEmail: string
  reporterName: string
}

const ITEMS_PER_PAGE = 5;

export default function CollectPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<CollectionTask | null>(null);
  const [verificationImage, setVerificationImage] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle');
  const [verificationResult, setVerificationResult] = useState<{ wasteTypeMatch: boolean; quantityMatch: boolean; confidence: number } | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [collectorCoords, setCollectorCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const updatePos = (pos: GeolocationPosition) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCollectorCoords(coords);
    };
    const watcher = navigator.geolocation.watchPosition(updatePos, undefined, { maximumAge: 15000 });
    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  useEffect(() => {
    if (!user || !collectorCoords) return;
    upsertCollectorLocation(user.id, collectorCoords.lat, collectorCoords.lng);
  }, [user, collectorCoords]);

  useEffect(() => {
    const fetchUserAndTasks = async () => {
      setLoading(true);
      try {
        const userEmail = localStorage.getItem('userEmail');
        let currentUserId: number | undefined;
        if (userEmail) {
          const fetchedUser = await getUserByEmail(userEmail);
          if (fetchedUser) {
            setUser(fetchedUser);
            currentUserId = fetchedUser.id;
          } else {
            console.error('User not found');
          }
        }
        const fetchedTasks = await getWasteCollectionTasks(50, undefined, currentUserId);
        setTasks(fetchedTasks as CollectionTask[]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserAndTasks();
  }, []);

  const handleStatusChange = async (taskId: number, newStatus: CollectionTask['status']) => {
    if (!user) { toast.error('Please log in to collect waste.'); return; }
    try {
      const updated = await updateTaskStatus(taskId, newStatus, user.id);
      if (updated) {
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, status: newStatus, collectorId: user.id } : task
        ));
        toast.success('Task accepted!');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update task status.');
    }
  };

  const compressImage = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = base64;
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setVerificationImage(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVerify = async () => {
    if (!selectedTask || !verificationImage || !user) {
      toast.error('Missing required information for verification.');
      return;
    }

    setVerificationStatus('verifying');
    try {
      const collectionHash = await computeImageHash(verificationImage);
      if (collectionHash === selectedTask.imageHash) {
         setVerificationStatus('failure');
         toast.error("Fraud detected: You cannot use the same image as the original report.", { duration: 5000 });
         return;
      }

      const result = await verifyAndCompleteCollection(selectedTask.id, user.id, verificationImage);
      if (result) {
        setVerificationResult(result);
        setVerificationStatus('success');
        if (result.reward) setReward(result.reward);
        toast.success('Collection verified and reward earned!');
        setSelectedTask(null);
        setVerificationImage(null);
        
        // Dispatch balance update event for header
        window.dispatchEvent(new CustomEvent('balanceUpdated'));
        
        // Refresh server state
        router.refresh();

        // Refresh tasks locally
        const fetchedTasks = await getWasteCollectionTasks(50);
        setTasks(fetchedTasks as CollectionTask[]);
      }
    } catch (error: any) {
      console.error('Error verifying:', error);
      setVerificationStatus('failure');
      toast.error(error?.message || "AI verification failed. Please try again.");
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !activeFilter || task.wasteType.toLowerCase().includes(activeFilter);
    return matchesSearch && matchesFilter;
  });

  const pageCount = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800">Waste Collection Tasks</h1>

      {collectorCoords && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4">
          <MapPin className="h-3 w-3" />
          Your location is being tracked to show you nearby tasks
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Search by area..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
          {WASTE_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setActiveFilter(opt.value); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFilter === opt.value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader className="animate-spin h-8 w-8 text-gray-500" />
        </div>
      ) : (
        <>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-xl shadow-sm">
              <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No tasks found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedTasks.map(task => (
                <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium text-gray-800 flex items-center">
                      <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                      {task.location}
                    </h2>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 mb-3">
                     <div className="flex items-center"><Trash2 className="w-4 h-4 mr-2" /> {task.wasteType}</div>
                     <div className="flex items-center"><Weight className="w-4 h-4 mr-2" /> {task.amount}</div>
                     <div className="flex items-center"><Calendar className="w-4 h-4 mr-2" /> {task.date}</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {task.status === 'pending' && (
                      <Button onClick={() => handleStatusChange(task.id, 'in_progress')} variant="outline" size="sm">
                        Start Collection
                      </Button>
                    )}
                    {task.status === 'in_progress' && task.collectorId === user?.id && (
                      <>
                        <Button onClick={() => setSelectedTask(task)} variant="outline" size="sm" className="bg-blue-50 text-blue-700">
                          Verify
                        </Button>
                        <Button 
                          onClick={() => window.location.href = `mailto:${task.reporterEmail}?subject=Inquiry&body=Hi ${task.reporterName}, ...`} 
                          variant="outline" size="sm"
                        >
                          Contact
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
           <div className="bg-white p-6 rounded-xl max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Complete Collection</h2>
              <input type="file" onChange={handleImageUpload} accept="image/*" className="mb-4" />
              {verificationImage && <img src={verificationImage} className="mb-4 rounded-md" />}
              <Button onClick={handleVerify} disabled={verificationStatus === 'verifying'} className="w-full bg-green-600 mb-2">
                {verificationStatus === 'verifying' ? (
                  <><Loader className="animate-spin h-4 w-4 mr-2" /> Verifying...</>
                ) : (
                  'Verify & Complete'
                )}
              </Button>
              <Button onClick={() => setSelectedTask(null)} variant="ghost" className="w-full">Cancel</Button>
           </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CollectionTask['status'] }) {
  const config = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
    in_progress: { color: 'bg-blue-100 text-blue-800', icon: Trash2, label: 'In Progress' },
    completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Completed' },
    verified: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle, label: 'Verified' },
    expired: { color: 'bg-gray-100 text-gray-500', icon: Clock, label: 'Expired' },
  };
  const { color, icon: Icon, label } = config[status] || config.pending;
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${color} flex items-center`}>
      <Icon className="mr-1 h-3 w-3" />{label}
    </span>
  );
}