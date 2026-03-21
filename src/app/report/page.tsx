'use client'

import { useState, useCallback, useEffect } from 'react';
import { MapPin, Upload, CheckCircle, Loader, AlertTriangle, ShieldCheck, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';


import { StandaloneSearchBox, useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { Libraries } from '@react-google-maps/api';
import { createReport, getRecentReports, getUserByEmail, checkReportFraud, verifyWaste } from '@/utils/db/actions';

import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const libraries: Libraries = ['places'];

async function computeImageHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ReportPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const router = useRouter();

  const [reports, setReports] = useState<Array<{
    id: number; location: string; wasteType: string; amount: string; createdAt: string;
  }>>([]);

  const [newReport, setNewReport] = useState({ location: '', type: '', amount: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle');
  const [verificationResult, setVerificationResult] = useState<{ wasteType: string; quantity: string; confidence: number } | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [isNotWaste, setIsNotWaste] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const [searchBox, setSearchBox] = useState<google.maps.places.SearchBox | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fraudCheckResult, setFraudCheckResult] = useState<{ allowed: boolean; reason?: string } | null>(null);

  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey!,
    libraries,
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.warn('GPS unavailable')
      );
    }
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const email = localStorage.getItem('userEmail');
      if (email) {
        const dbUser = await getUserByEmail(email);
        if (dbUser) {
          setUser(dbUser);
          const recentReports = await getRecentReports();
          setReports(recentReports.map(r => ({
            ...r,
            createdAt: new Date(r.createdAt).toISOString().split('T')[0]
          })));
        } else {
          router.push('/');
        }
      } else {
        router.push('/');
      }
      setIsAuthLoading(false);
    };
    checkUser();
  }, [router]);

  const onLoad = useCallback((ref: google.maps.places.SearchBox) => setSearchBox(ref), []);

  const [map, setMap] = useState<google.maps.Map | null>(null);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => setMap(mapInstance), []);

  const onPlacesChanged = () => {
    if (searchBox) {
      const places = searchBox.getPlaces();
      if (places && places.length > 0) {
        const place = places[0];
        const location = place.formatted_address || '';
        setNewReport(prev => ({ ...prev, location }));
        if (place.geometry?.location) {
          const newCoords = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
          setGpsCoords(newCoords);
          map?.panTo(newCoords);
        }
      }
    }
  };

  const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const newCoords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      setGpsCoords(newCoords);
      reverseGeocode(newCoords);
    }
  };

  const reverseGeocode = (coords: { lat: number; lng: number }) => {
    if (isMapsLoaded && window.google) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: coords }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          setNewReport(prev => ({ ...prev, location: results[0].formatted_address }));
        }
      });
    }
  };

  const handleCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsCoords(newCoords);
          map?.panTo(newCoords);
          reverseGeocode(newCoords);
          toast.success('Location updated to your current position.');
        },
        () => toast.error('Unable to retrieve your location.')
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewReport({ ...newReport, [name]: value });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setVerificationStatus('idle');
      setVerificationResult(null);
      setFraudCheckResult(null);
      setIsEmergency(false);
      setIsNotWaste(false);



      const hash = await computeImageHash(selectedFile);
      setImageHash(hash);

      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleVerify = async () => {
    if (!file || !user || !imageHash || !preview) return;

    setVerificationStatus('verifying');
    
    try {
      const fraudCheck = await checkReportFraud(user.id, imageHash);
      setFraudCheckResult(fraudCheck);
      if (!fraudCheck.allowed) {
        setVerificationStatus('failure');
        toast.error(fraudCheck.reason || 'Report blocked.');
        return;
      }

      const parsedResult = await verifyWaste(preview);

      if (parsedResult.isEmergency) {
        setVerificationStatus('failure');
        setIsEmergency(true);
        toast.error('EMERGENCY detected!', { duration: 10000 });
        alert('🚨 EMERGENCY DETECTED: Dead species (animal or human) identified. \n\nPLEASE CONTACT THE POLICE IMMEDIATELY: 100 or 112 \n\nThis incident will not be uploaded as waste.');

        return;
      }


      if (!parsedResult.isWaste) {
        setVerificationStatus('failure');
        setIsNotWaste(true);
        toast.error(`Image rejected: ${parsedResult.rejectionReason || 'Not identified as waste.'}`);
        return;
      }


      if (parsedResult.confidence < 0.80) {
        setVerificationStatus('failure');
        toast.error(`Low confidence (${(parsedResult.confidence * 100).toFixed(0)}%). Upload a clearer image.`);
        return;
      }

      setVerificationResult({ wasteType: parsedResult.wasteType, quantity: parsedResult.quantity, confidence: parsedResult.confidence });
      setVerificationStatus('success');
      setNewReport(prev => ({ ...prev, type: parsedResult.wasteType, amount: parsedResult.quantity }));
      toast.success('Image verified!');
    } catch (error: any) {
      console.error('Verification error:', error);
      setVerificationStatus('failure');
      if (error.message?.includes('EMERGENCY')) {
        setIsEmergency(true);
        alert('🚨 EMERGENCY DETECTED: Dead species identified. Please contact the police immediately: 100 or 112.');
      } else {


        toast.error('AI verification failed. Try again with a clearer image.');
      }
    }

  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationStatus !== 'success' || !user) {
      toast.error('Please verify the waste image before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await createReport(
        user.id,
        newReport.location,
        newReport.type,
        newReport.amount,
        preview || undefined,
        gpsCoords || undefined,
        imageHash || undefined,
      ) as any;


      if (!report) {
        toast.error('Submission failed. Please try again.');
        return;
      }

      setReports([{
        id: report.id,
        location: report.location,
        wasteType: report.wasteType,
        amount: report.amount,
        createdAt: new Date(report.createdAt).toISOString().split('T')[0]
      }, ...reports]);

      setNewReport({ location: '', type: '', amount: '' });
      setFile(null);
      setPreview(null);
      setImageHash(null);
      setVerificationStatus('idle');
      setVerificationResult(null);
      setFraudCheckResult(null);
      toast.success("Report submitted! You've earned 10 points.");
      window.dispatchEvent(new CustomEvent('balanceUpdated'));

    } catch (error: any) {
      console.error('Error submitting report:', error);
      if (error.message?.includes('EMERGENCY')) {
        alert('🚨 EMERGENCY DETECTED: Dead species identified. Please contact the police immediately: 100 or 112.');
      } else {

        toast.error(error?.message || 'Failed to submit report.');
      }
    } finally {
      setIsSubmitting(false);
    }

  };

  if (isAuthLoading) return (
    <div className="flex justify-center items-center h-screen">
      <Loader className="animate-spin h-10 w-10 text-green-500" />
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800">Report Waste</h1>

      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 text-sm text-blue-700">
        <ShieldCheck className="h-5 w-5 flex-shrink-0" />
        <span>Each report is verified by AI. Duplicate images and rapid submissions are automatically blocked to keep the platform fair.</span>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 md:p-8 rounded-2xl shadow-lg mb-12">
        <div className="mb-8">
          <label className="block text-lg font-medium text-gray-700 mb-2">1. Upload Waste Image</label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-green-500 transition-colors duration-300">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label htmlFor="waste-image" className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500">
                  <span>Upload a file</span>
                  <input id="waste-image" name="waste-image" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
            </div>
          </div>
        </div>

        {preview && (
          <div className="mt-4 mb-8">
            <img src={preview} alt="Waste preview" className="max-w-full h-auto rounded-xl shadow-md max-h-64 object-cover" />
            {imageHash && <p className="text-xs text-gray-400 mt-1 font-mono">Hash: {imageHash.slice(0, 12)}...</p>}
          </div>
        )}

        <div className="mb-8">
          <label className="block text-lg font-medium text-gray-700 mb-2">2. Verify with AI</label>
          <Button
            type="button"
            onClick={handleVerify}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg rounded-xl transition-colors duration-300"
            disabled={!file || verificationStatus === 'verifying'}
          >
            {verificationStatus === 'verifying' ? (
              <><Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />Verifying...</>
            ) : 'Verify Waste Image'}
          </Button>
        </div>

        {verificationStatus === 'success' && verificationResult && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-8 rounded-r-xl">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-400 mr-3" />
              <div>
                <h3 className="text-lg font-medium text-green-800">Verification Successful</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Waste Type: <strong className="capitalize">{verificationResult.wasteType}</strong></p>
                  <p>Quantity: {verificationResult.quantity}</p>
                  <p>Confidence: {(verificationResult.confidence * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {verificationStatus === 'failure' && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8 rounded-r-xl">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-400 mr-3" />
              <div>
                <h3 className="text-lg font-medium text-red-800">
                  {isEmergency ? 'Emergency Detected' : (isNotWaste ? 'No Waste Image Found' : 'Verification Failed')}
                </h3>
                <p className="mt-2 text-sm text-red-700">
                  {isEmergency 
                    ? '⚠️ Dead species identified. Please call emergency services (100 or 112) immediately. This report cannot be submitted.'
                    : (isNotWaste 

                        ? 'No waste image in uploaded image. Please upload a photo containing waste material.'
                        : (fraudCheckResult && !fraudCheckResult.allowed
                            ? fraudCheckResult.reason
                            : 'Could not verify this image. Please upload a clear, well-lit photo of the waste from above.'))}
                </p>

              </div>
            </div>
          </div>
        )}


        <div className="mb-8">
          <label className="block text-lg font-medium text-gray-700 mb-2">3. Confirm Details</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              {isMapsLoaded ? (
                <StandaloneSearchBox onLoad={onLoad} onPlacesChanged={onPlacesChanged}>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={newReport.location}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl pr-10 shadow-sm focus:ring-2 focus:ring-green-500 transition-all"
                    placeholder="Enter waste location"
                  />
                </StandaloneSearchBox>
              ) : (
                <input type="text" id="location" name="location" value={newReport.location} onChange={handleInputChange} required className="w-full px-4 py-2 border border-gray-300 rounded-xl" placeholder="Loading Maps..." disabled />
              )}
              <button
                type="button"
                onClick={handleCurrentLocation}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-600 transition-colors"
                title="Use current location"
              >
                <Crosshair className="h-5 w-5" />
              </button>
            </div>

            {isMapsLoaded && (
              <div className="mt-4 h-64 w-full rounded-xl overflow-hidden border border-gray-200 shadow-inner">
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={gpsCoords || { lat: 0, lng: 0 }}
                  zoom={gpsCoords ? 15 : 2}
                  onLoad={onMapLoad}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                  }}
                >
                  {gpsCoords && (
                    <Marker
                      position={gpsCoords}
                      draggable={true}
                      onDragEnd={handleMarkerDragEnd}
                      animation={google.maps.Animation.DROP}
                    />
                  )}
                </GoogleMap>
              </div>
            )}

            {gpsCoords && (
              <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1 font-mono">
                <MapPin className="h-3 w-3 text-green-500" />
                Precision: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)} (Drag marker to refine)
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Waste Type (AI verified)</label>
              <input type="text" value={newReport.type} required className="w-full px-4 py-2 border border-gray-300 rounded-xl bg-gray-100 capitalize" placeholder="Verified by AI" readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Amount (AI verified)</label>
              <input type="text" value={newReport.amount} required className="w-full px-4 py-2 border border-gray-300 rounded-xl bg-gray-100" placeholder="Verified by AI" readOnly />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg rounded-xl flex items-center justify-center"
          disabled={isSubmitting || verificationStatus !== 'success'}
        >
          {isSubmitting ? (
            <><Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />Submitting...</>
          ) : 'Submit Report (+10 tokens)'}
        </Button>
      </form>

      <h2 className="text-2xl font-semibold mb-4 text-gray-800">Recent Reports</h2>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <MapPin className="inline-block w-4 h-4 mr-2 text-green-500" />
                    {report.location.length > 30 ? report.location.slice(0, 30) + '...' : report.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{report.wasteType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}