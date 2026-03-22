'use client'

import { useState, useEffect } from 'react'
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
  const [selectedTask, setSelectedTask] = useState<CollectionTask | null>(null);
  const [verificationImage, setVerificationImage] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle');
  const [verificationResult, setVerificationResult] = useState<{ wasteTypeMatch: boolean; quantityMatch: boolean; confidence: number } | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [collectorCoords, setCollectorCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
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
            toast.error('User not found. Please log in again.');
          }
        }
        const fetchedTasks = await getWasteCollectionTasks(50, undefined, currentUserId);
        setTasks(fetchedTasks as CollectionTask[]);
      } catch (error) {
        toast.error('Failed to load tasks. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserAndTasks();
  }, []);

  const handleStatusChange = async (taskId: number, newStatus: CollectionTask['status']) => {
    if (!user) { toast.error('Please log in to collect waste.'); return; }
    try {
      const updatedTask = await updateTaskStatus(taskId, newStatus, user.id, collectorCoords || undefined);
      if (updatedTask) {
        setTasks(tasks.map(task =>
          task.id === taskId ? { ...task, status: newStatus, collectorId: user.id } : task
        ));
        toast.success('Task accepted!');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update task status.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setVerificationImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleVerify = async () => {
    if (!selectedTask || !verificationImage || !user) {
      toast.error('Missing required information for verification.');
      return;
    }

    if (selectedTask.status === 'verified') {
      toast.error('This task has already been verified.');
      return;
    }

    setVerificationStatus('verifying');
    try {
      // Client-side fraud check: deduplication
      const collectionHash = await computeImageHash(verificationImage);
      if (collectionHash === selectedTask.imageHash) {
         setVerificationStatus('failure');
         toast.error("Fraud detected: You cannot use the same image as the original report.", { duration: 5000 });
         return;
      }

      const result = await verifyAndCompleteCollection(selectedTask.id, user.id, verificationImage);

      if (result.success) {
        setVerificationStatus('success');
        setReward(result.reward);
        setTasks(tasks.map(task =>
          task.id === selectedTask.id ? { ...task, status: 'verified', collectorId: user.id } : task
        ));
        toast.success(`Verified! You earned ${result.reward} tokens!`, { duration: 5000 });
        window.dispatchEvent(new CustomEvent('balanceUpdated'));
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
          ({collectorCoords.lat.toFixed(4)}, {collectorCoords.lng.toFixed(4)})
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
          {activeFilter && (
            <span className="text-xs text-gray-500 ml-1">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
            </span>
          )}
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
              <p>No tasks found{activeFilter ? ` for "${activeFilter}" waste type` : ''}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedTasks.map(task => (
                <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium text-gray-800 flex items-center">
                      <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                      {task.location.length > 50 ? task.location.slice(0, 50) + '...' : task.location}
                    </h2>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 mb-3">
                    <div className="flex items-center">
                      <Trash2 className="w-4 h-4 mr-2 text-gray-500" />
                      <span className="capitalize font-medium">{task.wasteType}</span>
                    </div>
                    <div className="flex items-center">
                      <Weight className="w-4 h-4 mr-2 text-gray-500" />
                      {task.amount}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                      {task.date}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {task.status === 'pending' && (
                      <Button onClick={() => handleStatusChange(task.id, 'in_progress')} variant="outline" size="sm">
                        Start Collection
                      </Button>
                    )}
                    {task.status === 'in_progress' && task.collectorId === user?.id && (
                      <div className="flex gap-2">
                        <Button onClick={() => setSelectedTask(task)} variant="outline" size="sm" className="bg-blue-50 border-blue-200 text-blue-700">
                          Complete & Verify
                        </Button>
                        <Button 
                          onClick={() => window.location.href = `mailto:${task.reporterEmail}?subject=Waste Collection Inquiry&body=Hi ${task.reporterName}, I am the collector for your waste report at ${task.location}.`} 
                          variant="outline" 
                          size="sm"
                          className="bg-gray-50 border-gray-200 text-gray-700"
                        >
                          Contact Reporter
                        </Button>
                      </div>
                    )}
                    {task.status === 'in_progress' && task.collectorId !== user?.id && (
                      <span className="text-yellow-600 text-sm font-medium">In progress by another collector</span>
                    )}
                    {task.status === 'verified' && (
                      <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> Reward Earned
                      </span>
                    )}
                    {task.status === 'expired' && (
                      <span className="text-gray-400 text-sm font-medium">Expired</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-center items-center gap-4">
            <Button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} variant="outline" size="sm">
              Previous
            </Button>
            <span className="text-sm text-gray-600">Page {currentPage} of {Math.max(pageCount, 1)}</span>
            <Button onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))} disabled={currentPage === pageCount || pageCount === 0} variant="outline" size="sm">
              Next
            </Button>
          </div>
        </>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-1">Verify Collection</h3>
            <p className="text-sm text-gray-500 mb-4">
              Claimed: <strong className="capitalize">{selectedTask.wasteType}</strong> — {selectedTask.amount}
            </p>
            <p className="text-sm text-gray-600 mb-4">Upload a clear photo of the collected waste to verify and earn your reward.</p>

            <div className="mb-4">
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Camera className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="verification-image" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                      <span>Upload a file</span>
                      <input id="verification-image" type="file" className="sr-only" onChange={handleImageUpload} accept="image/*" />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                </div>
              </div>
            </div>

            {verificationImage && <img src={verificationImage} alt="Verification" className="mb-4 rounded-md w-full max-h-48 object-cover" />}

            <Button onClick={handleVerify} className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={!verificationImage || verificationStatus === 'verifying' || verificationStatus === 'success'}>
              {verificationStatus === 'verifying' ? (
                <><Loader className="animate-spin -ml-1 mr-3 h-5 w-5" />Verifying...</>
              ) : (verificationStatus === 'success' ? 'Verification Successful' : 'Verify Collection')}
            </Button>


            {verificationStatus === 'success' && verificationResult && (
              <div className={`mt-4 p-4 rounded-md ${verificationResult.wasteTypeMatch && verificationResult.quantityMatch ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <p>Type match: {verificationResult.wasteTypeMatch ? '✅ Yes' : '❌ No'}</p>
                <p>Quantity match: {verificationResult.quantityMatch ? '✅ Yes' : '❌ No'}</p>
                <p>Confidence: {(verificationResult.confidence * 100).toFixed(1)}%</p>
                {reward && <p className="mt-2 font-semibold text-green-700">🎉 Earned {reward} tokens!</p>}
              </div>
            )}
            {verificationStatus === 'failure' && (
              <p className="mt-2 text-red-600 text-center text-sm">Verification failed. Please try again with a clearer image.</p>
            )}

            <Button
              onClick={() => {
                setSelectedTask(null);
                setVerificationImage(null);
                setVerificationStatus('idle');
                setVerificationResult(null);
                setReward(null);
              }}
              variant="outline"
              className="w-full mt-2"
            >
              Close
            </Button>
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