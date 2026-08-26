import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface GeneratePortalPdfOptions {
  wardName: string;
  title?: string;
  url: string;
  instructionText?: string;
}

export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 1024,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

export async function createPortalPdfDoc(options: GeneratePortalPdfOptions): Promise<jsPDF> {
  const {
    wardName,
    title = 'Digital Program',
    url,
    instructionText = "Scan with your phone's camera to view today's program"
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 215.9mm
  const centerX = pageWidth / 2;

  // 1. Ward Name Header
  doc.setFont('helvetica', 'bold');
  let wardFontSize = 28;
  doc.setFontSize(wardFontSize);
  let wardTextWidth = doc.getTextWidth(wardName);
  while (wardTextWidth > 175 && wardFontSize > 16) {
    wardFontSize -= 2;
    doc.setFontSize(wardFontSize);
    wardTextWidth = doc.getTextWidth(wardName);
  }
  doc.setTextColor(24, 24, 27); // zinc-900
  doc.text(wardName, centerX, 36, { align: 'center' });

  // 2. Subtitle: Digital Program
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(82, 82, 91); // zinc-600
  doc.text(title, centerX, 48, { align: 'center' });

  // 3. Subtle divider rule
  doc.setDrawColor(228, 228, 231); // zinc-200
  doc.setLineWidth(0.5);
  doc.line(centerX - 40, 56, centerX + 40, 56);

  // 4. Large centered QR Code (125mm x 125mm)
  const qrDataUrl = await generateQrDataUrl(url);
  const qrSize = 125;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = 66;

  // Light frame behind QR
  doc.setDrawColor(244, 244, 245); // zinc-100
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 3, 3, 'FD');

  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  // 5. Instruction text below QR
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(39, 39, 42); // zinc-800
  doc.text(instructionText, centerX, 206, { align: 'center' });

  // 6. Monospace Clean URL at bottom
  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(113, 113, 122); // zinc-500
  doc.text(url, centerX, 218, { align: 'center' });

  // 7. Outer subtle card border
  doc.setDrawColor(228, 228, 231); // zinc-200
  doc.setLineWidth(0.4);
  doc.roundedRect(15, 18, pageWidth - 30, 215, 4, 4);

  return doc;
}

export function sanitizePdfFilename(wardName: string, suffix = 'digital-program'): string {
  const cleanName = wardName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${cleanName || 'ward'}-${suffix}.pdf`;
}

export async function downloadPortalPdf(options: GeneratePortalPdfOptions): Promise<void> {
  const doc = await createPortalPdfDoc(options);
  const filename = sanitizePdfFilename(options.wardName);
  doc.save(filename);
}
