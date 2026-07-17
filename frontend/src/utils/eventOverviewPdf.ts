import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

type EventOverviewPdfOptions = {
  html: string;
  css: string;
  filename: string;
};

const waitForImages = async (container: HTMLElement) => {
  await Promise.all(
    Array.from(container.querySelectorAll('img')).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    })
  );
};

export const createEventOverviewPdfUrl = async ({ html, css, filename }: EventOverviewPdfOptions) => {
  const container = document.createElement('div');
  container.className = 'event-overview-pdf-render';
  container.innerHTML = `<style>${css}</style><main class="print-content">${html}</main>`;
  document.body.appendChild(container);

  try {
    await waitForImages(container);
    if ('fonts' in document) await document.fonts.ready;

    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false
    });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      (pageWidth - imageWidth) / 2,
      (pageHeight - imageHeight) / 2,
      imageWidth,
      imageHeight
    );

    pdf.setProperties({ title: filename });
    return URL.createObjectURL(pdf.output('blob'));
  } finally {
    container.remove();
  }
};
