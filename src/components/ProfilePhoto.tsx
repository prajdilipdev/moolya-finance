import { useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Round avatar: the profile photo if set, otherwise initials. */
export function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  return url ? (
    <img src={url} alt="" className={cn('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-accent-fill font-bold text-white', className)}>
      {initials(name)}
    </span>
  )
}

/** Center-crops to a square and re-encodes as a 256px WebP (~15–30 KB). */
async function toSquareWebp(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/webp', 0.85))
}

export function ProfilePhoto() {
  const { db, updateProfile } = useApp()
  const { user } = useAuth()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const url = db.profile?.avatarUrl
  const name = db.profile?.name || user?.email || 'You'

  const upload = async (file: File) => {
    if (!supabase || !user) return
    if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
      toast({ title: 'Unsupported image', message: 'Pick a JPG, PNG or WebP under 15 MB.', tone: 'warning' })
      return
    }
    setBusy(true)
    try {
      const blob = await toSquareWebp(file)
      // New name each time so browsers and the CDN never show a cached old photo.
      const path = `${user.id}/${Date.now()}.webp`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp' })
      if (error) throw error
      const old = url?.split('/avatars/')[1]
      updateProfile({ avatarUrl: supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl })
      if (old) supabase.storage.from('avatars').remove([old])
      toast({ title: 'Photo updated', tone: 'success' })
    } catch (e) {
      toast({ title: 'Upload failed', message: e instanceof Error ? e.message : 'Try another image.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    const old = url?.split('/avatars/')[1]
    updateProfile({ avatarUrl: null })
    if (old && supabase) supabase.storage.from('avatars').remove([old])
  }

  if (!user) return null

  return (
    <div className="mb-4 flex items-center gap-4">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label="Change profile photo"
      >
        <Avatar name={name} url={url} className="h-16 w-16 text-lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </span>
      </button>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {url ? 'Change photo' : 'Upload photo'}
        </button>
        {url && (
          <button type="button" onClick={remove} disabled={busy} className="btn-ghost">
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) upload(f)
        }}
      />
    </div>
  )
}
